// Configuración mutable del modelo — se puede actualizar en caliente desde el admin panel
const config = {
  model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  temperature: parseFloat(process.env.GROQ_TEMPERATURE) || 0.4,
  maxTokens: parseInt(process.env.GROQ_MAX_TOKENS) || 1024,

  // Modelo de fallback cuando Groq no está disponible
  fallback: {
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY
  },

  // Modelos disponibles para seleccionar desde el admin panel
  availableModels: [
    { id: 'llama-3.3-70b-versatile', provider: 'groq', label: 'Llama 3.3 70B (Groq)' },
    { id: 'llama-3.1-8b-instant', provider: 'groq', label: 'Llama 3.1 8B Instant (Groq)' },
    { id: 'mixtral-8x7b-32768', provider: 'groq', label: 'Mixtral 8x7B (Groq)' },
    { id: 'deepseek-chat', provider: 'deepseek', label: 'DeepSeek V3' },
    { id: 'deepseek-reasoner', provider: 'deepseek', label: 'DeepSeek R1' }
  ]
};

/**
 * Retorna la configuración actual del modelo
 * @returns {object}
 */
export function getModelConfig() {
  return config;
}

/**
 * Actualiza la configuración del modelo en caliente
 * @param {Partial<typeof config>} updates
 */
export function updateModelConfig(updates) {
  if (updates.model !== undefined) config.model = updates.model;
  if (updates.temperature !== undefined) config.temperature = parseFloat(updates.temperature);
  if (updates.maxTokens !== undefined) config.maxTokens = parseInt(updates.maxTokens);
  if (updates.fallback !== undefined) config.fallback = { ...config.fallback, ...updates.fallback };
}