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
Objective: Act as an expert in pop culture, cinema, and current Italian trends. Research the actual top 10 most popular movies/TV shows in Italy right now among two specific demographic targets.
You must find exactly 10 distinct titles trending among "Gen Z" (Adolescenti/Teenagers) and exactly 10 distinct titles trending among "Millennials" (Young Adults/30-40yo).

CRITICAL RULES:
1. ONLY return data for the categories "Gen Z" and "Millennials".
2. You must specify the streaming platform or "Cinema" where the content is currently available in Italy. Do not hallucinate platforms.
3. Mix movies and TV shows as they appear in real trends.
4. You must output ONLY a valid JSON array of objects. Do not use markdown blocks, just the raw JSON array.

Format strictly:
[
  {
    "title": "Titolo in italiano",
    "type": "movie oppure tv",
    "target": "Gen Z oppure Millennials",
    "platform": "Es. Netflix, Prime Video, Disney+, Cinema, ecc.",
    "rank": "Numero da 1 a 10 (posizione in classifica per quel target)",
    "description": "Breve sinossi e motivazione del perché è virale/popolare per questo target"
  }
]`;

    console.log("Inizio interrogazione AI per i Trend Generazionali (Gen Z e Millennials)...");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.1 }
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
        console.log(`Trovati ${allItems.length} titoli da Gemini per le classifiche generazionali.`);
    } catch(e) {
        console.error("Errore nel parsing del JSON di Gemini:", rawText);
        process.exit(1);
    }
    
    // Ordiniamo prima per target e poi per rank (da 1 a 10)
    allItems.sort((a, b) => {
        if (a.target === b.target) {
            return parseInt(a.rank) - parseInt(b.rank);
        }
        return a.target.localeCompare(b.target);
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

    fs.writeFileSync('target.json', JSON.stringify(payloadData, null, 2));
    console.log("target.json salvato con successo!");
}

main();