import fs from 'fs';
import path from 'path';

const CONFIG_DIR = '/app/config';
const CONFIG_FILE = path.join(CONFIG_DIR, 'settings.json');

// Configuración por defecto
const defaultConfig = {
  model: 'llama-3.3-70b-versatile',
  temperature: 0.4,
  maxTokens: 1024,
  fallbackModel: 'deepseek-chat',
  apiKeys: {
    groq: '',
    deepseek: '',
    tavily: ''
  },
  availableModels: [
    { id: 'llama-3.3-70b-versatile', provider: 'groq', label: 'Llama 3.3 70B (Groq)' },
    { id: 'llama-3.1-8b-instant', provider: 'groq', label: 'Llama 3.1 8B Instant (Groq)' },
    { id: 'mixtral-8x7b-32768', provider: 'groq', label: 'Mixtral 8x7B (Groq)' },
    { id: 'deepseek-chat', provider: 'deepseek', label: 'DeepSeek V3' },
    { id: 'deepseek-reasoner', provider: 'deepseek', label: 'DeepSeek R1' }
  ]
};

// Cargar configuración desde settings.json o crear si no existe
function loadConfig() {
  try {
    // Asegurar que el directorio existe
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Si el archivo existe, leerlo
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }

    // Si no existe, crear uno con los valores por defecto
    saveConfig(defaultConfig);
    return { ...defaultConfig };
  } catch (error) {
    console.error('Error cargando configuración:', error);
    return { ...defaultConfig };
  }
}

let config = loadConfig();

/**
 * Retorna la configuración actual del modelo
 * @returns {object}
 */
export function getModelConfig() {
  return {
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    fallbackModel: config.fallbackModel,
    apiKeys: {
      groq: maskApiKey(config.apiKeys?.groq),
      deepseek: maskApiKey(config.apiKeys?.deepseek),
      tavily: maskApiKey(config.apiKeys?.tavily)
    },
    availableModels: config.availableModels
  };
}

/**
 * Enmascara una API key para mostrar solo los últimos 4 caracteres
 * @param {string} key
 * @returns {string}
 */
function maskApiKey(key) {
  if (!key || typeof key !== 'string' || key.length < 4) {
    return '••••••••••••••••';
  }
  return '•'.repeat(Math.max(16, key.length - 4)) + key.slice(-4);
}

/**
 * Actualiza y persiste la configuración del modelo en settings.json
 * @param {Partial<typeof config>} updates
 */
export function updateModelConfig(updates) {
  if (updates.model !== undefined) config.model = updates.model;
  if (updates.temperature !== undefined) config.temperature = parseFloat(updates.temperature);
  if (updates.maxTokens !== undefined) config.maxTokens = parseInt(updates.maxTokens);
  if (updates.fallbackModel !== undefined) config.fallbackModel = updates.fallbackModel;
  
  // Actualizar API keys si se proporcionan
  if (updates.apiKeys) {
    config.apiKeys = config.apiKeys || {};
    if (updates.apiKeys.groq !== undefined) config.apiKeys.groq = updates.apiKeys.groq;
    if (updates.apiKeys.deepseek !== undefined) config.apiKeys.deepseek = updates.apiKeys.deepseek;
    if (updates.apiKeys.tavily !== undefined) config.apiKeys.tavily = updates.apiKeys.tavily;
  }

  // Persistir a disco
  saveConfig(config);
}

/**
 * Obtiene las API keys sin enmascarar (solo para uso interno)
 * @returns {object}
 */
export function getApiKeys() {
  return config.apiKeys || { groq: '', deepseek: '', tavily: '' };
}

/**
 * Guarda la configuración en settings.json
 * @param {object} data
 */
function saveConfig(data) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('Configuración guardada en:', CONFIG_FILE);
  } catch (error) {
    console.error('Error guardando configuración:', error);
  }
}