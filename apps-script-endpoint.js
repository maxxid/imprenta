/**
 * ENDPOINT PARA PARSER IA CON GEMINI
 * 
 * Agregar esto a tu Google Apps Script existente.
 * Este endpoint recibe mensajes de WhatsApp, los envía a Gemini,
 * y devuelve el JSON parseado.
 * 
 * La API key se mantiene segura en el servidor de Google.
 */

// ===== AGREGAR ESTAS FUNCIONES A TU APPS SCRIPT =====

function doGet(e) {
  const params = e.parameter;
  const mode = params.mode || 'default';
  
  if (mode === 'parse') {
    return handleParseRequest(params.mensaje);
  }
  
  if (mode === 'generate-wa') {
    return handleGenerateWaRequest(params.data);
  }
  
  // Tu lógica existing de doGet va acá
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleParseRequest(mensaje) {
  if (!mensaje) {
    return jsonResponse({ error: 'Falta el parametro mensaje' });
  }
  
  try {
    // 1. Llamar a Gemini con el prompt
    const resultado = procesarConGeminiDirecto(mensaje);
    
    // 2. Parsear la respuesta JSON de Gemini
    const pedidos = parsearRespuestaGemini(resultado);
    
    return jsonResponse({ 
      status: 'ok',
      pedidos: pedidos,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse({ 
      error: 'Error al procesar: ' + error.message,
      stack: error.stack
    });
  }
}

function procesarConGeminiDirecto(prompt) {
  // Usar la misma API key que ya tenés configurada
  const API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY no configurada en PropertiesService');
  }
  
  const MODEL = 'gemini-2.0-flash-exp'; // O el modelo que uses
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  
  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json'
    }
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  
  if (json.error) {
    throw new Error('Gemini API error: ' + json.error.message);
  }
  
  return json.candidates[0].content.parts[0].text;
}

function parsearRespuestaGemini(texto) {
  // Limpiar el texto (a veces Gemini agrega ```json ... ```)
  let limpio = texto.trim();
  if (limpio.startsWith('```')) {
    limpio = limpio.replace(/^```json\s*/, '').replace(/```\s*$/, '');
  }
  
  const data = JSON.parse(limpio);
  
  // Asegurar que sea un array
  const pedidos = Array.isArray(data) ? data : [data];
  
  return pedidos.map(p => ({
    alumno: p.alumno || 'Sin nombre',
    formato: p.formato || 'A4',
    libro: p.libro || '',
    hojas: Number(p.hojas) || 0,
    paginas: Number(p.paginas) || 0,
    fecha: p.fecha || '',
    precio: Number(p.precio) || 0,
    sena: Number(p.sena) || 0,
    telefono: (p.telefono || '').replace(/\D/g, '')
  }));
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleGenerateWaRequest(dataJson) {
  if (!dataJson) {
    return jsonResponse({ error: 'Faltan datos del pedido' });
  }
  
  try {
    const data = JSON.parse(dataJson);
    const prompt = buildWaPrompt(data);
    const resultado = procesarConGeminiDirecto(prompt);
    const msjWs = extractMsjWs(resultado);
    
    return jsonResponse({ msj_ws: msjWs });
  } catch (error) {
    return jsonResponse({ error: 'Error: ' + error.message });
  }
}

function buildWaPrompt(data) {
  const hoy = new Date();
  const fechaHoyStr = hoy.toLocaleDateString('es-AR');
  
  const contextoLibros = (data.libros || []).map(l =>
    `- [${l.titulo}] | Hojas: ${l.hojas} | Pags: ${l.paginas} | Precio: ${l.precio}`
  ).join('\n');
  
  const lugarEntrega = data.lugar_entrega || 'la facultad';
  const saldoTexto = data.saldo > 0
    ? `El saldo pendiente es ${data.saldo}. Mencionale el monto total.`
    : 'Ya tiene todo pagado, no menciones dinero.';
  
  return `Hoy es ${fechaHoyStr}. Genera un mensaje de WhatsApp para confirmar entrega.
  
DATOS DEL PEDIDO:
- Alumno: ${data.nombre}
- Telefono: ${data.whatsapp}
- Libros: ${contextoLibros}
- Fecha de entrega: ${data.fecha || 'no especificada'}
- Lugar de entrega: ${lugarEntrega}
- ${saldoTexto}

REGLAS DE ORO:
1. Redacta un mensaje corto y natural en español rioplatense ("tenés", "¿cómo estás?").
2. Tiene que ser para enviar el día de entrega: confirmar si podrá ir así llevamos su pedido a ${lugarEntrega} o reagendamos.
3. Si el lugar es diferente a la facultad (Lavalle, clínica), incluilo. Si no, por defecto es en la facultad.
4. Si el saldo es 0, no menciones dinero, solo que ya está listo.
5. Si tiene saldo, decile el monto total.
6. NO uses emojis excesivos. Sé profesional pero cercano.

Responde ÚNICAMENTE el mensaje de WhatsApp, sin comillas ni formato JSON.`;
}

function extractMsjWs(texto) {
  let limpio = texto.trim();
  if (limpio.startsWith('"')) {
    limpio = limpio.replace(/^["']|["']$/g, '');
  }
  if (limpio.startsWith('```')) {
    limpio = limpio.replace(/^```\w*\s*/, '').replace(/```\s*$/, '');
  }
  return limpio;
}

// ===== INSTRUCCIONES DE DEPLOY =====
/*
1. Abrir tu Google Apps Script
2. Pegar estas funciones al final del archivo
3. Ir a Propiedades del proyecto (engranaje) → Propiedades del script
4. Agregar: GEMINI_API_KEY = tu-api-key
5. Deploy → New deployment → Web app
   - Execute as: Me
   - Who has access: Anyone
6. Copiar la URL del deployment
7. En tu config.json, poner esa URL en: integraciones.SHEETS_API_URL
*/
