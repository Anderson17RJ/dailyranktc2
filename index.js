import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());
const PORT = process.env.PORT || 10000;
const BASE_URL = "https://thecrims.com";

async function fetchTop50ViaPlaywright() {
  // Lança browser (no container a imagem Playwright já tem tudo)
  const browser = await chromium.launch({
    headless: false, // RODAR headful para reduzir detecção
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1200,800'
    ]
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1200, height: 800 },
    javaScriptEnabled: true,
  });

  // anti-detection: sobrescrever navigator.webdriver e outros
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // opcional: navigator.plugins, languages, etc
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'permissions', { get: () => ({ query: () => ({ state: 'granted' }) }) });
  });

  const page = await context.newPage();

  // Acessa diretamente a rota da API - mas Cloudflare pode exigir passagem por página principal
  // Vamos primeiro visitar a página principal para criar cookies e executar JS
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // pequena espera para o Cloudflare completar eventuais scripts
  await page.waitForTimeout(3000);

  // Agora faça fetch da API interna do site pelo próprio navegador (mesmo contexto/cookies)
  const apiUrl = `${BASE_URL}/api/v1/stats/killers?country=&character=&level=`;
  const jsonText = await page.evaluate(async (url) => {
    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) {
        return JSON.stringify({ __status: r.status, __text: await r.text().catch(()=>'' ) });
      }
      return await r.text();
    } catch (e) {
      return JSON.stringify({ __error: String(e) });
    }
  }, apiUrl);

  console.log("==== conteudo bruto do thecrims ====");
  console.log(jsonText.slice(0, 500));
  console.log("====================================");

  // Fecha browser (ou feche contexto para manter session — aqui fechamos)
  await browser.close();

  // jsonText pode já ser JSON ou um objeto string com erro
  try {
    const parsed = JSON.parse(jsonText);
    // se parsed é um objeto com __status, devolve erro
    if (parsed && (parsed.__status || parsed.__error)) {
      throw new Error(JSON.stringify(parsed));
    }
    // se API retornou JSON (string), parse
    const data = typeof parsed === 'object' ? parsed : JSON.parse(jsonText);
    return data.killers?.slice(0, 50) ?? [];
  } catch (e) {
    // fallback: se jsonText for apenas texto JSON, tenta parse
    try {
      const data2 = JSON.parse(jsonText);
      return data2.killers?.slice(0,50) ?? [];
    } catch (err) {
      throw new Error("Falha ao parsear resposta Playwright: " + String(e) + " raw:" + jsonText);
    }
  }
}

app.get("/api/top50", async (req, res) => {
  try {
    const top50 = await fetchTop50ViaPlaywright();
    // caso precise, você pode mapear e calcular kills_hoje aqui antes de retornar
    return res.json(top50);
  } catch (err) {
    console.error("Erro Playwright:", err);
    return res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});