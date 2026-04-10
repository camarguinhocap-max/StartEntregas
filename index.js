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

function categorizarGasto(texto) {
  texto = texto.toLowerCase();

  if (texto.includes("gasolina") || texto.includes("posto")) return "combustivel";
  if (texto.includes("ifood") || texto.includes("comida") || texto.includes("lanche")) return "alimentacao";
  if (texto.includes("uber") || texto.includes("99")) return "transporte";
  if (texto.includes("aluguel") || texto.includes("luz") || texto.includes("agua")) return "fixo";

  return "outros";
}

// ================= SERVER =================

app.post("/", async (req, res) => {
  res.sendStatus(200);

  const message = req.body.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  console.log("Mensagem:", text);

  // ================= MENU =================
  if (text === "/start") return sendMenu(chatId);

  // ================= SUGESTÃO (INICIO) =================
  if (text.includes("Sugerir melhoria")) {
    userState[chatId] = { step: "sugestao" };
    return sendMessage(chatId, "💡 Digite sua sugestão:");
  }

  // ================= RESUMO COMPLETO =================
  if (text === "📊 Ver resumo") {
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

      const hoje = new Date();

      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() - hoje.getDay());
      inicioSemana.setHours(0, 0, 0, 0);

      const fimSemana = new Date(inicioSemana);
      fimSemana.setDate(inicioSemana.getDate() + 6);
      fimSemana.setHours(23, 59, 59, 999);

      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

      let ganhos = 0, gastos = 0;
      let ganhosHoje = 0, gastosHoje = 0;
      let ganhosSemana = 0, gastosSemana = 0;
      let ganhosMes = 0, gastosMes = 0;

      dados.forEach(item => {
        const valor = Number(item.Valor || 0);
        const data = new Date(item.Data);
        const isGasto = item.Tipo === "gasto";

        if (isGasto) gastos += valor;
        else ganhos += valor;

        if (data.toDateString() === hoje.toDateString()) {
          if (isGasto) gastosHoje += valor;
          else ganhosHoje += valor;
        }

        if (data >= inicioSemana && data <= fimSemana) {
          if (isGasto) gastosSemana += valor;
          else ganhosSemana += valor;
        }

        if (data >= inicioMes && data <= fimMes) {
          if (isGasto) gastosMes += valor;
          else ganhosMes += valor;
        }
      });

      const mensagem =
`📊 *RESUMO FINANCEIRO*

📅 *HOJE*
💰 Ganhos: R$ ${ganhosHoje.toFixed(2)}
💸 Gastos: R$ ${gastosHoje.toFixed(2)}
📊 Saldo: R$ ${(ganhosHoje - gastosHoje).toFixed(2)}

📆 *SEMANA*
💰 Ganhos: R$ ${ganhosSemana.toFixed(2)}
💸 Gastos: R$ ${gastosSemana.toFixed(2)}
📊 Saldo: R$ ${(ganhosSemana - gastosSemana).toFixed(2)}

🗓️ *MÊS*
💰 Ganhos: R$ ${ganhosMes.toFixed(2)}
💸 Gastos: R$ ${gastosMes.toFixed(2)}
📊 Saldo: R$ ${(ganhosMes - gastosMes).toFixed(2)}

💼 *TOTAL GERAL*
💰 Ganhos: R$ ${ganhos.toFixed(2)}
💸 Gastos: R$ ${gastos.toFixed(2)}
📊 Saldo: R$ ${(ganhos - gastos).toFixed(2)}`;

      const link = "https://v0-startentregras.vercel.app/?user_id=" + chatId;

      return sendMessage(chatId, mensagem + "\n\n📈 Ver dashboard:\n" + link, {
        parse_mode: "Markdown"
      });

    } catch (error) {
      console.log(error);
      return sendMessage(chatId, "Erro ao buscar dados.");
    }
  }

  // ================= REGISTRAR GASTO =================
  if (text.includes("Registrar gasto")) {
    userState[chatId] = { step: "categoria_gasto", tipo: "gasto" };

    return sendMessage(chatId, "Escolha o tipo de gasto:", {
      keyboard: [
        ["⛽ Combustível"],
        ["💼 Pró-labore"],
        ["📦 Outros"]
      ],
      resize_keyboard: true
    });
  }

  // ================= CATEGORIA =================
  if (userState[chatId] && userState[chatId].step === "categoria_gasto") {
    let categoria = "";

    if (text.includes("Combustível")) categoria = "combustivel";
    else if (text.includes("Pró-labore")) categoria = "pro_labore";
    else if (text.includes("Outros")) categoria = "outros";

    if (!categoria) return sendMessage(chatId, "Escolha válida.");

    userState[chatId].categoria = categoria;
    userState[chatId].step = "data";

    return sendMessage(chatId, "Escolha a data:", {
      keyboard: [
        ["📅 Hoje", "📅 Ontem"],
        ["📅 Outra data"]
      ],
      resize_keyboard: true
    });
  }

  // ================= ADICIONAR GANHO =================
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

    if (/^\d{1,2}$/.test(texto)) {
      const hoje = new Date();
      const dia = parseInt(texto);

      const data = new Date(hoje.getFullYear(), hoje.getMonth(), dia);

      userState[chatId].data = data.toISOString();
      userState[chatId].step = "valor";

      return sendMessage(chatId, "Digite o valor:");
    }

    const partes = texto.split("/");

    if (partes.length === 3) {
      const data = new Date(partes[2], partes[1] - 1, partes[0]);

      userState[chatId].data = data.toISOString();
      userState[chatId].step = "valor";

      return sendMessage(chatId, "Digite o valor:");
    }

    return sendMessage(chatId, "Formato inválido.");
  }

  // ================= SUGESTÃO (CAPTURA) =================
  if (userState[chatId] && userState[chatId].step === "sugestao") {
    const sugestao = text;

    const GRUPO_ID = "-100XXXXXXXXXX"; // COLOCA SEU ID

    await sendMessage(GRUPO_ID,
      `💡 NOVA SUGESTÃO\n\n👤 User: ${chatId}\n📝 ${sugestao}`
    );

    delete userState[chatId];

    return sendMessage(chatId, "✅ Sugestão enviada!");
  }

  // ================= VALOR =================
  if (userState[chatId] && userState[chatId].step === "valor") {
    let valor = parseFloat(text.replace(",", "."));

    if (isNaN(valor)) {
      valor = textoParaNumero(text);
    }

    if (!valor) return sendMessage(chatId, "Valor inválido.");

    const dados = userState[chatId];

    let categoria = dados.categoria;

    if (dados.tipo === "gasto" && categoria === "outros") {
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
      ["➕ Adicionar ganho", "💸 Registrar gasto"],
      ["📊 Ver resumo", "💡 Sugerir melhoria"]
    ],
    resize_keyboard: true
  });
}

app.listen(3000, () => {
  console.log("Servidor rodando 🚀");
});
