const fs = require('fs');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

const MODEL = 'gemini-2.5-flash';

async function fetchTMDBPoster(title, type, tmdbKey) {
    if (!tmdbKey || !title) return '';
    try {
        const searchType = (String(type).toLowerCase().includes('tv') || String(type).toLowerCase().includes('serie')) ? 'tv' : 'movie';
        const query = encodeURIComponent(title);
        const url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${query}&language=it-IT&page=1`;
        
        const response = await fetch(url);
        if (!response.ok) return '';
        
        const data = await response.json();
        if (data.results && data.results.length > 0 && data.results[0].poster_path) {
            return `https://image.tmdb.org/t/p/w500${data.results[0].poster_path}`;
        }
        return '';
    } catch (e) {
        console.error('TMDB Error per:', title, e);
        return '';
    }
}

async function main() {
    if (!GEMINI_API_KEY) {
        console.error("ERRORE: Nessuna GEMINI_API_KEY configurata nei Secrets.");
        process.exit(1);
    }
    
    // Calcolo Data Dinamico per Gemini (dal 1° del mese corrente a fine dei successivi 2 mesi)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 3, 0);
    
    const formatD = d => {
        const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    };
    const dateRangeStr = `dal ${formatD(firstDay)} al ${formatD(lastDay)}`;

    const promptText = `
Objective: Research current and upcoming movie and TV show releases in Italy strictly ${dateRangeStr}.
You must find at least 8-10 distinct titles for EACH of these 5 platforms: Netflix, Amazon Prime Video, Disney+, Cinema in Italia, Discovery+.

You must output ONLY a valid JSON array of objects containing ALL titles. Do not use markdown blocks, just the raw JSON array.

Format strictly:
[
  {
    "title": "Titolo film/serie in italiano",
    "type": "movie oppure tv",
    "platform": "Nome esatto della piattaforma tra le 5 indicate",
    "date": "Data di uscita in Italia (es. Marzo 2026)",
    "description": "Breve sinossi in italiano"
  }
]`;

    console.log(`Inizio interrogazione AI per il periodo: ${dateRangeStr}...`);
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.2 }
        })
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("Errore API Gemini:", err);
        process.exit(1);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        console.error("Risposta vuota da Gemini");
        process.exit(1);
    }

    let rawText = String(text).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let allItems = [];
    try {
        allItems = JSON.parse(rawText);
        console.log(`Trovati ${allItems.length} titoli da Gemini.`);
    } catch(e) {
        console.error("Errore nel parsing del JSON di Gemini:", rawText);
        process.exit(1);
    }

    if(TMDB_API_KEY) {
        console.log("Recupero locandine ufficiali da TMDB...");
        const fetchPromises = allItems.map(async (item) => {
            item.posterUrl = await fetchTMDBPoster(item.title, item.type, TMDB_API_KEY);
            return item;
        });
        allItems = await Promise.all(fetchPromises);
    } else {
        console.log("TMDB_API_KEY mancante, salto le locandine.");
    }

    const payloadData = {
        date: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
        data: allItems
    };

    fs.writeFileSync('data.json', JSON.stringify(payloadData, null, 2));
    console.log("data.json salvato con successo!");
}

main();