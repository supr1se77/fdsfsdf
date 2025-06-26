const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Colors,
    AttachmentBuilder,
} = require("discord.js");
const { createPixPayment: criarPagamento, getPaymentStatus: verificarPagamento } = require("../services/zeroone");
const config = require("../config.json");
const fs = require('fs');
const path = require('path');

const pagamentosContexto = new Map();

function criarPainelCobranca(status, dados) {
    const { valor, cliente, admin, pagamentoId, expiraEmTimestamp } = dados;
    const embeds = {
        pendente: new EmbedBuilder()
            .setColor(Colors.Yellow).setTitle("⏳ Aguardando Pagamento PIX")
            .setDescription(`Uma nova cobrança foi gerada para **${cliente.username}**.\nPor favor, realize o pagamento para continuar.`)
            .setThumbnail(cliente.displayAvatarURL())
            .addFields(
                { name: "👤 Cliente", value: `<@${cliente.id}>`, inline: true },
                { name: "💰 Valor", value: `R$ ${valor.toFixed(2).replace('.', ',')}`, inline: true },
                { name: "⌛ Expira em", value: `<t:${expiraEmTimestamp}:R>`, inline: true }
            ).setFooter({ text: `ID da Transação: ${pagamentoId}` }).setTimestamp(),
        
        confirmado: new EmbedBuilder()
            .setColor(Colors.Green).setTitle("✅ Pagamento Confirmado!")
            .setDescription(`O pagamento de **${cliente.username}** foi aprovado com sucesso!`)
            .setThumbnail('https://media.discordapp.net/attachments/1376705206913339493/1383586879475154975/LOGO_GIF.gif?ex=684f5531&is=684e03b1&hm=f1550c9b4c785522e05ef67e75cfcb3fabec7fb681524e4227dbbd238a380510&=')
            .addFields(
                { name: "👤 Cliente", value: `<@${cliente.id}>`, inline: true },
                { name: "💰 Valor Pago", value: `R$ ${valor.toFixed(2).replace('.', ',')}`, inline: true },
                { name: "👨‍💼 Admin", value: `<@${admin.id}>`, inline: true }
            ).setFooter({ text: `ID da Transação: ${pagamentoId}` }).setTimestamp(),

        expirado: new EmbedBuilder()
            .setColor(Colors.Red).setTitle("❌ Pagamento Expirado")
            .setDescription(`A cobrança para **${cliente.username}** não foi paga a tempo.`)
            .setThumbnail('https://media.discordapp.net/attachments/1376705206913339493/1383586879475154975/LOGO_GIF.gif?ex=684f5531&is=684e03b1&hm=f1550c9b4c785522e05ef67e75cfcb3fabec7fb681524e4227dbbd238a380510&=')
            .addFields(
                { name: "👤 Cliente", value: `<@${cliente.id}>`, inline: true },
                { name: "💰 Valor", value: `R$ ${valor.toFixed(2).replace('.', ',')}`, inline: true },
                { name: "👨‍💼 Admin", value: `<@${admin.id}>`, inline: true }
            ).setFooter({ text: `ID da Transação: ${pagamentoId}` }).setTimestamp(),
            
        finalizado: new EmbedBuilder()
            .setColor(Colors.Blue).setTitle("✨ Processo Finalizado")
            .setDescription(`O cargo de comprador foi entregue para **${cliente.username}**!`)
            .setThumbnail(cliente.displayAvatarURL())
            .addFields(
                { name: "👤 Cliente", value: `<@${cliente.id}>`, inline: true },
                { name: "💰 Valor Pago", value: `R$ ${valor.toFixed(2).replace('.', ',')}`, inline: true },
                { name: "👨‍💼 Admin Responsável", value: `<@${admin.id}>`, inline: true }
            ).setFooter({ text: `ID da Transação: ${pagamentoId}` }).setTimestamp(),
    };
    return embeds[status];
}

// Esta função parece ser um resquício de uma versão antiga, mas corrigi mesmo assim por segurança.
async function handleSelect(interaction, selectedValue) {
    try {
        const [tipo, valor] = selectedValue.split('_');
        const valorNumerico = parseFloat(valor);

        // ==================================================================================
        // ===== CORREÇÃO APLICADA AQUI (Mesmo sendo código antigo) =======================
        // ==================================================================================
        const response = await criarPagamento(valorNumerico, `Pagamento para ${interaction.user.username}`);

        const tempDir = path.join(__dirname, '..', 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        const qrCodePath = path.join(tempDir, 'qrcode.png');
        const qrCodeBase64 = response.pixUrl.replace('data:image/png;base64,', '');
        fs.writeFileSync(qrCodePath, qrCodeBase64, 'base64');
        const qrCodeAttachment = new AttachmentBuilder(qrCodePath, { name: 'qrcode.png' });

        const embed = new EmbedBuilder().setColor('#0099ff').setTitle('Pagamento PIX').setDescription(`Valor: R$ ${valorNumerico.toFixed(2)}`).addFields({ name: 'Código PIX', value: `\`\`\`${response.pixCopyPaste}\`\`\`` }, { name: 'Status', value: response.status }).setImage('attachment://qrcode.png').setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('copiar_pix').setLabel('Copiar Código PIX').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('verificar_pagamento').setLabel('Verificar Pagamento').setStyle(ButtonStyle.Success));

        await interaction.reply({ embeds: [embed], components: [row], files: [qrCodeAttachment] });

        setTimeout(() => {
            try {
                if(fs.existsSync(qrCodePath)) fs.unlinkSync(qrCodePath);
            } catch (error) { console.error('Erro ao deletar arquivo temporário:', error); }
        }, 5000);

    } catch (error) {
        console.error('Erro ao gerar cobrança:', error);
        await interaction.reply({ content: 'Ocorreu um erro ao gerar a cobrança.', ephemeral: true });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("gerar")
        .setDescription("Gera uma cobrança PIX para um cliente.")
        .addNumberOption(opt => opt.setName("valor").setDescription("Valor da cobrança em reais (ex: 50)").setRequired(true).setMinValue(1))
        .addUserOption(opt => opt.setName("cliente").setDescription("O membro do Discord que irá pagar").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const valor = interaction.options.getNumber("valor");
        const cliente = interaction.options.getUser("cliente");
        const admin = interaction.user;

        await interaction.deferReply();

        let qrCodePath = '';

        try {
            // ==================================================================================
            // ===== CORREÇÃO PRINCIPAL APLICADA AQUI =========================================
            // ==================================================================================
            // Passando uma STRING como nome do produto, em vez de um objeto.
            const pagamento = await criarPagamento(valor, `Cobrança para ${cliente.username}`);
            
            const paymentId = String(pagamento.id);
            const expiraEmTimestamp = Math.floor((Date.now() + 30 * 60 * 1000) / 1000);
            const dadosCobranca = { valor, cliente, admin, pagamentoId: paymentId, expiraEmTimestamp };

            const tempDir = path.join(__dirname, '..', 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            qrCodePath = path.join(tempDir, `${paymentId}.png`);
            const qrCodeBase64 = pagamento.pixUrl.replace('data:image/png;base64,', '');
            fs.writeFileSync(qrCodePath, qrCodeBase64, 'base64');

            const qrCodeAttachment = new AttachmentBuilder(qrCodePath, { name: 'qrcode.png' });
            
            const painelInicial = criarPainelCobranca("pendente", dadosCobranca).setImage('attachment://qrcode.png');

            const rowInicial = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`gerar:copiar-pix:${paymentId}`).setLabel("Copiar PIX").setStyle(ButtonStyle.Success).setEmoji("📋"),
                new ButtonBuilder().setCustomId(`gerar:cancelar:${paymentId}`).setLabel("Cancelar").setStyle(ButtonStyle.Danger).setEmoji("✖️")
            );
            
            const painelMessage = await interaction.editReply({
                content: `||<@${cliente.id}>||`,
                embeds: [painelInicial],
                components: [rowInicial],
                files: [qrCodeAttachment]
            });
            
            pagamentosContexto.set(paymentId, { ...dadosCobranca, pixCopyPaste: pagamento.pixCopyPaste, interaction: interaction, message: painelMessage, pago: false });

            const intervalId = setInterval(async () => {
                const ctx = pagamentosContexto.get(paymentId);
                if (!ctx || ctx.pago) return clearInterval(intervalId);

                const paymentDetails = await verificarPagamento(paymentId).catch(() => null);

                if (paymentDetails && paymentDetails.status === 'APPROVED') {
                    ctx.pago = true;
                    clearInterval(intervalId);
                    if (fs.existsSync(qrCodePath)) fs.unlinkSync(qrCodePath);
                    
                    const painelConfirmado = criarPainelCobranca("confirmado", ctx);
                    const rowConfirmado = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`gerar:setarcargo:${paymentId}`).setLabel(`Entregar Cargo para ${cliente.username}`).setStyle(ButtonStyle.Primary).setEmoji("👑")
                    );
                    await ctx.message.edit({ content: `Pagamento de <@${cliente.id}> confirmado!`, embeds: [painelConfirmado], components: [rowConfirmado], files: [] });
                }
            }, 10000);

            setTimeout(() => {
                const ctx = pagamentosContexto.get(paymentId);
                if (ctx && !ctx.pago) {
                    clearInterval(intervalId);
                    if (fs.existsSync(qrCodePath)) fs.unlinkSync(qrCodePath);
                    const painelExpirado = criarPainelCobranca("expirado", ctx);
                    ctx.message.edit({ content: `A cobrança para <@${cliente.id}> expirou.`, embeds: [painelExpirado], components: [], files: [] });
                    pagamentosContexto.delete(paymentId);
                }
            }, 30 * 60 * 1000);

        } catch (err) {
            console.error("Erro ao gerar cobrança:", err);
            if (qrCodePath && fs.existsSync(qrCodePath)) fs.unlinkSync(qrCodePath);
            const errorEmbed = new EmbedBuilder().setColor(Colors.Red).setTitle("❌ Erro Crítico").setDescription("Não foi possível gerar a cobrança PIX. Verifique os logs do bot.");
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed], components: [], files: [] });
            }
        }
    },

    async handleButton(interaction) {
        const parts = interaction.customId.split(':');
        if (parts[0] !== 'gerar') return;

        const action = parts[1];
        const paymentId = parts[2];
        
        const ctx = pagamentosContexto.get(paymentId);

        if (!ctx) {
            return interaction.reply({ content: "❌ Esta cobrança é antiga ou inválida.", ephemeral: true });
        }

        if (action === 'copiar-pix') {
            return interaction.reply({ content: ctx.pixCopyPaste, ephemeral: true });
        }
        
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: "Você não tem permissão para executar esta ação.", ephemeral: true });
        }

        if (action === 'cancelar') {
            ctx.pago = true; // Impede verificações futuras
            const painelExpirado = criarPainelCobranca("expirado", ctx).setTitle("🚫 Cobrança Cancelada").setDescription(`Esta cobrança foi cancelada manualmente por <@${interaction.user.id}>.`);
            await interaction.update({ embeds: [painelExpirado], components: [] });
            pagamentosContexto.delete(paymentId);
        }

        if (action === 'setarcargo') {
            try {
                const member = await interaction.guild.members.fetch(ctx.cliente.id);
                const roleId = config.cargoCompradorID;
                if (!roleId) return interaction.reply({ content: 'ID do cargo de comprador não configurado.', ephemeral: true });

                if (member.roles.cache.has(roleId)) {
                    return interaction.reply({ content: `ℹ️ Este usuário já possui o cargo de comprador.`, ephemeral: true });
                }
                
                await member.roles.add(roleId);
                await interaction.reply({ content: `✅ Cargo de comprador entregue com sucesso para <@${ctx.cliente.id}>!`, ephemeral: true });
                await interaction.channel.send(`🎉 Parabéns, <@${ctx.cliente.id}>! Você recebeu seu cargo de **Comprador(a)**!`);
                
                const painelFinal = criarPainelCobranca("finalizado", ctx);
                // Usando o ctx.message para editar a mensagem original
                await ctx.message.edit({ embeds: [painelFinal], components: [] });
                pagamentosContexto.delete(paymentId);
            } catch (e) {
                console.error("Erro ao setar cargo:", e);
                await interaction.reply({ content: "❌ Não foi possível entregar o cargo. Verifique minhas permissões e se o usuário ainda está no servidor.", ephemeral: true });
            }
        }
    }
};