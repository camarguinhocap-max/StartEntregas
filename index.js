process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
const express = require("express");
const app = express();

app.use(express.json());

const TOKEN = "8613535785:AAFPfKjg94JavGcU7-WznFRotjHEAGBdVaQ";
const ADMIN_ID = "7340357750";


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
const callback = req.body.callback_query;

console.log("BODY:", JSON.stringify(req.body));

// 👉 trata callback primeiro
if (callback) {
  const data = callback.data;
  const adminChatId = callback.message.chat.id;

  console.log("Callback recebido:", data);

  // ✅ APROVAR
  if (data.startsWith("aprovar_")) {
    const userId = data.split("_")[1];

    await fetch(
      SUPABASE_URL + "/rest/v1/usuarios?id=eq." + userId,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        },
        body: JSON.stringify({
          plano_ate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        })
      }
    );

    await sendMessage(userId,
      "✅ Pagamento aprovado! Acesso liberado por 30 dias."
    );

    await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminChatId,
        message_id: callback.message.message_id,
        text: "✅ Pagamento aprovado"
      })
    });
  }

  // ❌ RECUSAR
  if (data.startsWith("recusar_")) {
    const userId = data.split("_")[1];

    await sendMessage(userId,
      "❌ Não identificamos seu pagamento. Envie o comprovante."
    );

    await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminChatId,
        message_id: callback.message.message_id,
        text: "❌ Pagamento recusado"
      })
    });
  }

  return;
}
// 👉 só depois valida mensagem
if (!message && !callback) return;
  
  const chatId = message.chat.id;
const text = message.text ? message.text.trim() : "";

  // ================= COMPROVANTE =================
if (message.photo && userState[chatId] && userState[chatId].step === "comprovante") {

  
  // ================= VALIDA ACESSO =================
let user;

try {
  const res = await fetch(
    SUPABASE_URL + "/rest/v1/usuarios?id=eq." + chatId.toString(),
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + SUPABASE_KEY
      }
    }
  );

  const data = await res.json();
  user = data[0];

} catch (e) {
  console.log("Erro user:", e);
}

// bloqueio
if (user) {
  const agora = new Date();

  const trial = new Date(user.trial_fim);
  const plano = user.plano_ate ? new Date(user.plano_ate) : null;

  if (agora > trial && (!plano || agora > plano)) {

  // 👉 se clicou já paguei
  if (text.includes("Já paguei")) {

  

  userState[chatId] = { step: "comprovante" };

return sendMessage(chatId,
`📸 Envie o comprovante do pagamento (print do PIX).`);
}

  return sendMessage(chatId,
`🚫 Seu período grátis acabou.

💰 Assine por R$9,90/mês

📌 PIX:
camargoinfomei@gmail.com

Após pagar, clique abaixo 👇`,
  {
    keyboard: [
      ["✅ Já paguei"]
    ],
    resize_keyboard: true
  });
}
}
  console.log("Mensagem:", text);

  // ================= MENU =================
  if (text.startsWith("/start")) {
  try {
    // pega referência (indicação)
    const partes = text.split(" ");
    const ref = partes[1];

    // verifica se já existe
    const check = await fetch(
      SUPABASE_URL + "/rest/v1/usuarios?id=eq." + chatId.toString(),
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        }
      }
    );

    const existe = await check.json();

    // se NÃO existir → cria
    if (!existe || existe.length === 0) {

      await fetch(SUPABASE_URL + "/rest/v1/usuarios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        },
        body: JSON.stringify({
          id: chatId.toString(),
          trial_fim: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          indicacoes: 0,
          indicados_pagantes: 0
        })
      });

      // se veio indicação válida
      if (ref && ref !== chatId.toString()) {
        await fetch(
          SUPABASE_URL + "/rest/v1/usuarios?id=eq." + ref,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_KEY,
              Authorization: "Bearer " + SUPABASE_KEY
            },
            body: JSON.stringify({
              indicacoes: 1 // depois podemos melhorar isso
            })
          }
        );
      }
    }

  } catch (e) {
    console.log("Erro cadastro:", e);
  }

  return sendMenu(chatId);
}

  // ================= SUGESTÃO (INICIO) =================
  if (text.includes("Sugerir melhoria")) {
    userState[chatId] = { step: "sugestao" };
    return sendMessage(chatId, "💡 Digite sua sugestão:");
  }
  if (text.includes("Indicar")) {
  const link = `https://t.me/startentregas_bot?start=${chatId}`;

  return sendMessage(chatId,
`🚀 Indique e ganhe 1 mês grátis!

Convide 10 amigos que assinarem.

Seu link:
${link}`
  );
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

    const GRUPO_ID = "-5207183146"; // COLOCA SEU ID

    await sendMessage(GRUPO_ID,
      `💡 NOVA SUGESTÃO\n\n👤 User: ${chatId}\n📝 ${sugestao}`
    );

    delete userState[chatId];

    return sendMessage(chatId, "✅ Sugestão enviada!");
  }

  const fileId = message.photo[message.photo.length - 1].file_id;

  console.log("📸 Foto recebida de:", chatId);

  // 👉 envia pro admin
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: ADMIN_ID,
      photo: fileId,
      caption: `💰 COMPROVANTE RECEBIDO\n\n👤 Usuário: ${chatId}`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Aprovar", callback_data: `aprovar_${chatId}` },
            { text: "❌ Recusar", callback_data: `recusar_${chatId}` }
          ]
        ]
      }
    })
  });

  delete userState[chatId];

  return sendMessage(chatId, "📸 Comprovante enviado para análise!");
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
  ["📊 Ver resumo", "💡 Sugerir melhoria"],
  ["🚀 Indicar e ganhar"]
],
    resize_keyboard: true
  });
}

app.listen(3000, () => {
  console.log("Servidor rodando 🚀");
});
