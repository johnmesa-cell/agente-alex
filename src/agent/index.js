import express from 'express';
import dotenv from 'dotenv';
import os from 'os';
import http from 'http';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { classifyIntent } from '../classifier/intentClassifier.js';
import {
  getConversationHistory,
  addToHistory,
  clearHistory,
  getActiveSessions,
  touchSession
} from '../memory/conversationHistory.js';
import {
  queryKnowledgeBase,
  queryUserUploads,
  saveUserUpload,
  clearUserUploads
} from '../tools/chromadb.js';
import { searchWeb } from '../tools/websearch.js';
import { getModelConfig, updateModelConfig, getApiKeys } from '../config/modelConfig.js';
import cookieParser from 'cookie-parser';
import { requireAdmin } from '../middlewares/adminAuth.js';

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static('admin'));

// Inicializar clientes a partir de la configuración persistente
const apiKeys = getApiKeys();
let groq = new Groq({ apiKey: apiKeys.groq || '' });
let deepseek = new OpenAI({
  apiKey: apiKeys.deepseek || '',
  baseURL: 'https://api.deepseek.com'
});

// ─────────────────────────────────────────
// ENDPOINTS PRINCIPALES
// ─────────────────────────────────────────

// Endpoint principal — recibe mensajes del backend
app.post('/chat', async (req, res) => {
  try {
    const { sessionId, userName, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId y message son requeridos' });
    }

    // Registrar actividad de sesión
    touchSession(sessionId);

    // 1. Clasificar intención
    const intent = await classifyIntent(message);

    // 2. Obtener historial de conversación
    const history = getConversationHistory(sessionId);

    // 3. Consultar ChromaDB — knowledge base + uploads del usuario
    const [knowledgeResults, uploadResults] = await Promise.all([
      queryKnowledgeBase(message),
      queryUserUploads(message, sessionId)
    ]);

    const knowledgeContext = [...knowledgeResults, ...uploadResults];

    // 4. Búsqueda web si ChromaDB no retornó resultados
    let webContext = '';
    if (knowledgeContext.length === 0) {
      webContext = await searchWeb(message);
    }

    // 5. Construir system prompt según intención
    const systemPrompt = buildSystemPrompt(intent, userName, knowledgeContext, webContext);

    // 6. Llamar al modelo con fallback automático
    const agentReply = await callModelWithFallback(systemPrompt, history, message);

    // 7. Actualizar historial
    addToHistory(sessionId, { role: 'user', content: message });
    addToHistory(sessionId, { role: 'assistant', content: agentReply });

    return res.json({ intent, reply: agentReply, sessionId });

  } catch (error) {
    console.error('Error en /chat:', error);
    return res.status(500).json({ error: 'Error interno del agente' });
  }
});

// Endpoint para subir documentos del usuario
app.post('/upload', async (req, res) => {
  try {
    const { sessionId, content, fileName } = req.body;

    if (!sessionId || !content || !fileName) {
      return res.status(400).json({ error: 'sessionId, content y fileName son requeridos' });
    }

    touchSession(sessionId);
    const docId = await saveUserUpload(sessionId, content, fileName);

    return res.json({ message: 'Documento guardado correctamente', docId });
  } catch (error) {
    console.error('Error en /upload:', error);
    return res.status(500).json({ error: 'Error al guardar el documento' });
  }
});

// Endpoint para limpiar sesión completa (historial + uploads)
app.delete('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  clearHistory(sessionId);
  await clearUserUploads(sessionId);
  return res.json({ message: 'Sesión eliminada correctamente' });
});

// ─────────────────────────────────────────
// ENDPOINTS ADMIN
// ─────────────────────────────────────────

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(process.cwd() + '/admin/index.html');
});

app.get('/admin/sessions', requireAdmin, (req, res) => {
  return res.json({ sessions: getActiveSessions() });
});

app.post('/admin/sessions/clear', requireAdmin, async (req, res) => {
  const sessions = getActiveSessions();
  for (const sessionId of sessions) {
    clearHistory(sessionId);
    await clearUserUploads(sessionId);
  }
  return res.json({ message: `${sessions.length} sesiones eliminadas` });
});

app.post('/admin/config', requireAdmin, (req, res) => {
  try {
    const { model, temperature, maxTokens, fallbackModel, apiKeys } = req.body;

    const updates = {};
    if (model !== undefined) updates.model = model;
    if (temperature !== undefined) updates.temperature = temperature;
    if (maxTokens !== undefined) updates.maxTokens = maxTokens;
    if (fallbackModel !== undefined) updates.fallbackModel = fallbackModel;
    if (apiKeys) updates.apiKeys = apiKeys;

    updateModelConfig(updates);

    if (apiKeys) {
      if (apiKeys.groq) groq = new Groq({ apiKey: apiKeys.groq });
      if (apiKeys.deepseek) deepseek = new OpenAI({ apiKey: apiKeys.deepseek, baseURL: 'https://api.deepseek.com' });
      if (apiKeys.tavily) process.env.TAVILY_API_KEY = apiKeys.tavily;
      console.log('Clientes recreados con nuevas API keys');
    }

    return res.json({ message: 'Configuración actualizada correctamente', config: getModelConfig() });
  } catch (error) {
    console.error('Error en POST /admin/config:', error);
    return res.status(500).json({ error: 'Error al actualizar configuración', details: error.message });
  }
});

app.get('/admin/config', requireAdmin, (req, res) => {
  return res.json(getModelConfig());
});

// NUEVO: Información del sistema (CPU, memoria, uptime)
app.get('/admin/system', requireAdmin, (req, res) => {
  const mem = process.memoryUsage();
  return res.json({
    uptime: Math.floor(process.uptime()),
    platform: process.platform,
    nodeVersion: process.version,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024)
    },
    os: {
      totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemMB: Math.round(os.freemem() / 1024 / 1024),
      cpus: os.cpus().length,
      loadAvg: os.loadavg()
    }
  });
});

// ─────────────────────────────────────────
// LÓGICA INTERNA
// ─────────────────────────────────────────

async function callModelWithFallback(systemPrompt, history, message) {
  const config = getModelConfig();

  // Intentar con modelo principal (Groq)
  try {
    const response = await groq.chat.completions.create({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message }
      ]
    });
    return response.choices[0].message.content;
  } catch (primaryError) {
    console.warn('Modelo principal falló, usando fallback DeepSeek:', primaryError.message);
  }

  // Fallback a DeepSeek
  try {
    const response = await deepseek.chat.completions.create({
      model: config.fallbackModel,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message }
      ]
    });
    return response.choices[0].message.content;
  } catch (fallbackError) {
    console.error('Fallback también falló:', fallbackError.message);
    throw new Error('No se pudo obtener respuesta de ningún modelo disponible');
  }
}

function buildSystemPrompt(intent, userName, knowledgeContext, webContext) {
  const name = userName || 'usuario';

  const context = knowledgeContext.length > 0
    ? `\n\nINFORMACIÓN DE REFERENCIA:\n${knowledgeContext.join('\n')}`
    : webContext
      ? `\n\nINFORMACIÓN COMPLEMENTARIA DE INTERNET:\n${webContext}`
      : '';

  const base = `Eres ALEX, un asistente de salud conversacional diseñado para ayudar a personas sin conocimientos médicos.\nTu nombre es ALEX. El usuario se llama ${name}.\nSiempre hablas en español, con lenguaje simple, claro y sin tecnicismos médicos.\nNunca reemplazas a un médico y siempre que sea necesario lo aclaras.\n${context}`;

  if (intent === 'emergency') {
    return `${base}\n\nMODO EMERGENCIA ACTIVO:\n- Guía al usuario paso a paso. Una instrucción a la vez.\n- Espera confirmación antes de dar el siguiente paso.\n- Adapta cada paso según lo que el usuario te reporte.\n- Desde tu primer mensaje indica claramente que debe llamar al 123 (emergencias) o al 106 (crisis de salud mental).\n- Mantén un tono calmante pero urgente.\n- Continúa acompañando al usuario hasta que confirme que llegó personal de emergencias.\n- Cuando el usuario confirme que llegó ayuda profesional, despídete indicando que ya está en buenas manos.`;
  }

  return `${base}\n\nMODO CONSULTA:\n- Responde de forma completa y clara en un solo mensaje.\n- Usa lenguaje simple, sin términos médicos complejos.\n- Al final de tu respuesta siempre incluye: "Recuerda que soy un asistente de IA y puedo cometer errores. Para mayor seguridad, consulta a un profesional de salud."`;
}

// ─────────────────────────────────────────
// INICIO DEL SERVIDOR
// ─────────────────────────────────────────

const PORT = process.env.PORT || 3500;
const server = http.createServer(app);

// WebSocket server para proxy de voz en tiempo real
// Solo acepta conexiones que vengan del backend de Alex
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const fromBackend = req.headers['x-from-backend'];
  const expectedOrigin = process.env.BACKEND_ORIGIN;

  if (pathname === '/admin/live') {
    // Validar header de autenticación interna
    if (!fromBackend || fromBackend !== 'true') {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    // Validar origin si está configurado
    if (expectedOrigin && req.headers.origin && req.headers.origin !== expectedOrigin) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos para controlar costos ~$0.04/min

wss.on('connection', (clientWs) => {
  console.log('🎙️ Conexión WebSocket /admin/live abierta');

  // Leer la key en tiempo real desde config (puede haber sido actualizada desde el panel)
  const realtimeKey = getApiKeys().openaiRealtimeKey || process.env.OPENAI_REALTIME_KEY || '';

  if (!realtimeKey) {
    clientWs.close(1011, 'OPENAI_REALTIME_KEY no configurada');
    console.warn('⚠️ Se intentó abrir sesión de voz sin OPENAI_REALTIME_KEY configurada');
    return;
  }

  // Abrir conexión hacia OpenAI Realtime API
  // Modelo correcto para esta funcionalidad prototipo: gpt-realtime-2
  const openaiWs = new WebSocket(
    'wss://api.openai.com/v1/realtime?model=gpt-realtime-2',
    {
      headers: {
        'Authorization': `Bearer ${realtimeKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    }
  );

  // Timeout automático de 10 minutos para controlar costos
  const sessionTimer = setTimeout(() => {
    console.log('⏱️ Sesión de voz expirada por timeout de 10 minutos');
    clientWs.close(1000, 'Session timeout');
    openaiWs.close();
  }, SESSION_TIMEOUT_MS);

  // Proxy bidireccional: backend-Alex → OpenAI
  clientWs.on('message', (data) => {
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(data);
    }
  });

  // Proxy bidireccional: OpenAI → backend-Alex
  openaiWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  openaiWs.on('error', (err) => {
    console.error('❌ Error WebSocket OpenAI Realtime:', err.message);
    clientWs.close(1011, 'Error en conexión con OpenAI');
  });

  openaiWs.on('open', () => {
    console.log('✅ Conexión con OpenAI Realtime API establecida');
  });

  clientWs.on('close', () => {
    clearTimeout(sessionTimer);
    openaiWs.close();
    console.log('🔇 Sesión de voz cerrada por el cliente');
  });

  openaiWs.on('close', () => {
    clearTimeout(sessionTimer);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ ALEX Agent corriendo en puerto ${PORT}`);
  console.log(`🔧 Panel admin disponible en /admin`);
  console.log(`🎙️ WebSocket /admin/live disponible`);
});
