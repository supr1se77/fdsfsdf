const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("termos")
    .setDescription("Exibe os Termos de Troca & Garantia"),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("📜 Termos de Troca & Garantia")
      .setDescription(
        `Você precisa enviar um vídeo mostrando:
• A data e hora no site da Magalu ou Tramontina;
• A tentativa de compra de um produto até R$150;
• Tudo isso dentro do prazo de 10 minutos após a liberação da info.

**Importante:**

Se o vídeo ou o contato não forem enviados dentro do prazo, não será feita a troca.

Compre apenas se estiver de acordo com essas condições. Caso contrário, por favor, não compre!

💬 | Caso necessite de alguma ajuda, abra ticket <#1375627890556801108>`
      )
      .setColor("#8a00ff");

    await interaction.reply({ embeds: [embed] }); // não tem ephemeral
  },
};