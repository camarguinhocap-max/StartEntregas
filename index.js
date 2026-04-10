const express = require("express");
const app = express();

app.use(express.json());

app.post("/", (req, res) => {
  const message = req.body.message;

  if (message && message.text) {
    console.log("Mensagem recebida:", message.text);
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Bot rodando 🚀");
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
