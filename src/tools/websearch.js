import dotenv from 'dotenv';

dotenv.config();

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_URL = 'https://api.tavily.com/search';
const MAX_RESULTS = 3;

/**
 * Realiza una búsqueda web complementaria usando Tavily
 * Solo se usa cuando ChromaDB no retorna resultados suficientes
 * @param {string} query
 * @returns {Promise<string>}
 */
export async function searchWeb(query) {
  if (!TAVILY_API_KEY) {
    console.warn('TAVILY_API_KEY no configurada — búsqueda web deshabilitada');
    return '';
  }

  try {
    const response = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TAVILY_API_KEY}`
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        max_results: MAX_RESULTS,
        include_answer: true,
        include_domains: [
          'minsalud.gov.co',
          'who.int',
          'medlineplus.gov',
          'mayoclinic.org',
          'cruzrojacolombiana.org'
        ]
      })
    });

    if (!response.ok) {
      console.error('Error en búsqueda web:', response.statusText);
      return '';
    }

    const data = await response.json();

    // Priorizar la respuesta directa si está disponible
    if (data.answer) return data.answer;

    // Si no, combinar los snippets de resultados
    return data.results
      ?.slice(0, MAX_RESULTS)
      .map(r => r.content)
      .join('\n\n') || '';

  } catch (error) {
    console.error('Error en búsqueda web:', error.message);
    return '';
  }
}