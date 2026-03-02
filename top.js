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
    
    const promptText = `
Objective: Research the current actual "Top 10 Most Viewed" (I più visti) movies and TV shows in Italy right now, today.
You must find exactly 10 distinct titles for Netflix Italy, 10 distinct titles for Amazon Prime Video Italy, and 10 distinct titles for Sky (incl. NOW) in Italy.

CRITICAL RULES:
1. ONLY return data for Netflix, Amazon Prime Video, and Sky.
2. Mix movies and TV shows as they appear in the real top 10 trends.
3. DO NOT hallucinate platforms. A Netflix Original like "One Piece" or "Stranger Things" CANNOT be on Amazon Prime Video or Sky. Double-check the actual platform ownership before assigning.
4. You must output ONLY a valid JSON array of objects. Do not use markdown blocks, just the raw JSON array.

Format strictly:
[
  {
    "title": "Titolo in italiano",
    "type": "movie oppure tv",
    "platform": "Netflix, Amazon Prime Video oppure Sky",
    "rank": "Numero da 1 a 10 (la posizione in classifica)",
    "description": "Breve sinossi o motivazione del perché è in top 10"
  }
]`;

    console.log("Inizio interrogazione AI per i contenuti Più Visti...");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.05 } // Estremamente basso per evitare allucinazioni
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
        console.log(`Trovati ${allItems.length} titoli da Gemini per la classifica.`);
    } catch(e) {
        console.error("Errore nel parsing del JSON di Gemini:", rawText);
        process.exit(1);
    }
    
    // Ordiniamo prima per piattaforma e poi per rank (da 1 a 10)
    allItems.sort((a, b) => {
        if (a.platform === b.platform) {
            return parseInt(a.rank) - parseInt(b.rank);
        }
        return a.platform.localeCompare(b.platform);
    });

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

    fs.writeFileSync('top.json', JSON.stringify(payloadData, null, 2));
    console.log("top.json salvato con successo!");
}

main();