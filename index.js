process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
const express = require("express");
const app = express();

app.use(express.json());

const TOKEN = "8613535785:AAFPfKjg94JavGcU7-WznFRotjHEAGBdVaQ";

// 👇 CONFIG SUPABASE
const SUPABASE_URL = "https://wvqrpliefwtmbswbbjnt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cXJwbGllZnd0bWJzd2Jiam50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDAxNTUsImV4cCI6MjA5MTM3NjE1NX0.E8vzsrpWYNKfrYXtn2DFo7m7ZS0__Weo6TcQOa9AbHw";

const userState = {};

// ================= UTIL =================

// 🔥 Converter texto em número
function textoParaNumero(texto) {
  texto = texto.toLowerCase();

  const mapa = {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3,
    quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
    dez: 10, vinte: 20, trinta: 30, quarenta: 40,
    cinquenta: 50, sessenta: 60, setenta: 70,
    oitenta: 80, noventa: 90, cem: 100, cento: 100
  };

  let total = 0;

  texto.split(" ").forEach(p => {
    if (mapa[p] !== undefined) total += mapa[p];
  });

  return total;
}

// 🔥 Categorizar gasto automaticamente
function categorizarGasto(texto) {
  texto = texto.toLowerCase();

  if (texto.includes("gasolina") || texto.includes("posto") || texto.includes("combust")) {
    return "combustivel";
  }

  if (texto.includes("ifood") || texto.includes("comida") || texto.includes("lanche") || texto.includes("restaurante")) {
    return "alimentacao";
  }

  if (texto.includes("uber") || texto.includes("99") || texto.includes("taxi")) {
    return "transporte";
  }

  if (texto.includes("aluguel") || texto.includes("luz") || texto.includes("agua") || texto.includes("internet")) {
    return "fixo";
  }

  return "outros";
}

// ================= SERVER =================

app.post("/", async (req, res) => {
  res.sendStatus(200);

  let message = req.body.message;
  if (!message) return;

  // ================= AUDIO (OPCIONAL FUTURO) =================
  if (message.voice) {
    return sendMessage(message.chat.id, "🎤 Áudio ainda não ativado.");
  }

  if (!message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  console.log("Mensagem:", text);

  // ================= MENU =================
  if (text === "/start") return sendMenu(chatId);

  // ================= RESUMO =================
  if (text.toLowerCase().includes("resumo")) {
    try {
      const response = await fetch(
        SUPABASE_URL + "/rest/v1/Registros?select=Valor,Data,Tipo&user_id=eq." + chatId.toString(),
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY
          }
        }
      );

      const dados = await response.json();

      let ganhos = 0;
      let gastos = 0;

      dados.forEach(item => {
        const valor = Number(item.Valor || 0);
        if (item.Tipo === "gasto") gastos += valor;
        else ganhos += valor;
      });

      const saldo = ganhos - gastos;

      return sendMessage(chatId,
        `📊 RESUMO\n\n💰 Ganhos: R$ ${ganhos}\n💸 Gastos: R$ ${gastos}\n📈 Saldo: R$ ${saldo}`
      );

    } catch {
      return sendMessage(chatId, "Erro ao buscar dados.");
    }
  }

  // ================= GASTO =================
  if (text.includes("Registrar gasto")) {
    userState[chatId] = { step: "data", tipo: "gasto" };

    return sendMessage(chatId, "Escolha a data:", {
      keyboard: [
        ["📅 Hoje", "📅 Ontem"],
        ["📅 Outra data"]
      ],
      resize_keyboard: true
    });
  }

  // ================= GANHO =================
  if (text.includes("Adicionar ganho")) {
    userState[chatId] = { step: "data", tipo: "ganho" };

    return sendMessage(chatId, "Escolha a data:", {
      keyboard: [
        ["📅 Hoje", "📅 Ontem"],
        ["📅 Outra data"]
      ],
      resize_keyboard: true
    });
  }

  // ================= DATAS =================
  if (text.includes("Hoje") && userState[chatId]) {
    userState[chatId].data = new Date().toISOString();
    userState[chatId].step = "valor";
    return sendMessage(chatId, "Digite o valor:");
  }

  if (text.includes("Ontem") && userState[chatId]) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    userState[chatId].data = d.toISOString();
    userState[chatId].step = "valor";
    return sendMessage(chatId, "Digite o valor:");
  }

  if (text.includes("Outra data") && userState[chatId]) {
    userState[chatId].step = "digitando_data";
    return sendMessage(chatId, "Digite o dia (ex: 2) ou DD/MM/AAAA:");
  }

  if (userState[chatId] && userState[chatId].step === "digitando_data") {
    const texto = text.trim();

    // só dia
    if (/^\d{1,2}$/.test(texto)) {
      const hoje = new Date();
      const dia = parseInt(texto);

      const data = new Date(
        hoje.getFullYear(),
        hoje.getMonth(),
        dia
      );

      userState[chatId].data = data.toISOString();
      userState[chatId].step = "valor";

      return sendMessage(chatId, "Digite o valor:");
    }

    // data completa
    const partes = texto.split("/");

    if (partes.length === 3) {
      const data = new Date(partes[2], partes[1] - 1, partes[0]);

      userState[chatId].data = data.toISOString();
      userState[chatId].step = "valor";

      return sendMessage(chatId, "Digite o valor:");
    }

    return sendMessage(chatId, "Formato inválido.");
  }

  // ================= VALOR =================
  if (userState[chatId] && userState[chatId].step === "valor") {
    let valor = parseFloat(text.replace(",", "."));

    if (isNaN(valor)) {
      valor = textoParaNumero(text);
    }

    if (!valor) return sendMessage(chatId, "Valor inválido.");

    const dados = userState[chatId];

    // 🔥 CATEGORIA AUTOMÁTICA
    let categoria = null;
    if (dados.tipo === "gasto") {
      categoria = categorizarGasto(text);
    }

    try {
      await fetch(SUPABASE_URL + "/rest/v1/Registros", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        },
        body: JSON.stringify({
          user_id: chatId.toString(),
          Tipo: dados.tipo,
          Categoria: categoria,
          Valor: valor,
          Data: dados.data
        })
      });
    } catch (e) {
      console.log(e);
    }

    delete userState[chatId];

    return sendMenu(chatId);
  }
});

// ================= FUNÇÕES =================

function sendMessage(chatId, text, keyboard) {
  return fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      reply_markup: keyboard
    })
  });
}

function sendMenu(chatId) {
  return sendMessage(chatId, "Escolha uma opção:", {
    keyboard: [
      ["➕ Adicionar ganho"],
      ["💸 Registrar gasto"],
      ["📊 Ver resumo"]
    ],
    resize_keyboard: true
  });
}

app.listen(3000, () => {
  console.log("Servidor rodando 🚀");
});
