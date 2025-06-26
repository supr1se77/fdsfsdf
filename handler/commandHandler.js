const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');

module.exports = async (client) => {
  const commands = [];
  client.commands.clear();

  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
    } else {
      console.log(`[AVISO] O comando ${file} tá mal formatado, sacou?`);
    }
  }

  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    console.log('Começando a registrar os comandos no servidor local...');

    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands },
    );

    console.log('Comandos registrados com sucesso no servidor local!');
  } catch (error) {
    console.error('Merda ao registrar comandos:', error);
  }
};
