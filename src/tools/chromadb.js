import { ChromaClient } from 'chromadb';
import dotenv from 'dotenv';

dotenv.config();

const client = new ChromaClient({ path: process.env.CHROMA_URL });

const KNOWLEDGE_COLLECTION = process.env.CHROMA_KNOWLEDGE_COLLECTION || 'knowledge_base';
const UPLOADS_COLLECTION = process.env.CHROMA_UPLOADS_COLLECTION || 'user_uploads';

const MAX_RESULTS = 5;

/**
 * Consulta la base de conocimiento médica general
 * @param {string} query
 * @returns {Promise<string[]>}
 */
export async function queryKnowledgeBase(query) {
  try {
    const collection = await client.getCollection({ name: KNOWLEDGE_COLLECTION });

    const results = await collection.query({
      queryTexts: [query],
      nResults: MAX_RESULTS
    });

    return results.documents?.[0] || [];
  } catch (error) {
    console.error('Error consultando knowledge_base:', error.message);
    return [];
  }
}

/**
 * Consulta documentos subidos por el usuario en la sesión
 * @param {string} query
 * @param {string} sessionId
 * @returns {Promise<string[]>}
 */
export async function queryUserUploads(query, sessionId) {
  try {
    const collection = await client.getCollection({ name: UPLOADS_COLLECTION });

    const results = await collection.query({
      queryTexts: [query],
      nResults: MAX_RESULTS,
      where: { sessionId }
    });

    return results.documents?.[0] || [];
  } catch (error) {
    console.error('Error consultando user_uploads:', error.message);
    return [];
  }
}

/**
 * Guarda un documento subido por el usuario
 * @param {string} sessionId
 * @param {string} content
 * @param {string} fileName
 */
export async function saveUserUpload(sessionId, content, fileName) {
  try {
    let collection;
    try {
      collection = await client.getCollection({ name: UPLOADS_COLLECTION });
    } catch {
      collection = await client.createCollection({ name: UPLOADS_COLLECTION });
    }

    const id = `${sessionId}-${Date.now()}`;

    await collection.add({
      ids: [id],
      documents: [content],
      metadatas: [{ sessionId, fileName, uploadedAt: new Date().toISOString() }]
    });

    return id;
  } catch (error) {
    console.error('Error guardando upload:', error.message);
    throw error;
  }
}

/**
 * Elimina todos los documentos de una sesión en user_uploads
 * @param {string} sessionId
 */
export async function clearUserUploads(sessionId) {
  try {
    const collection = await client.getCollection({ name: UPLOADS_COLLECTION });

    const results = await collection.get({
      where: { sessionId }
    });

    if (results.ids.length > 0) {
      await collection.delete({ ids: results.ids });
    }
  } catch (error) {
    console.error('Error limpiando uploads de sesión:', error.message);
  }
}