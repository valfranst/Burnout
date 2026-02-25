'use strict';

/**
 * Garante que o schema essencial exista no banco de dados.
 *
 * O docker-entrypoint-initdb.d só roda quando o volume é novo.
 * Se o volume já existir mas o banco estiver vazio (ex.: outro database),
 * esta função cria extensões, tipos, tabelas, triggers e índices
 * necessários para a aplicação funcionar.
 *
 * Usa CREATE … IF NOT EXISTS / DO $$ guard blocks para ser idempotente.
 */

const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function bootstrap() {
  const client = await pool.unthrottledPool.connect();
  try {
    // Verifica se as tabelas principais já existem
    const { rows } = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('burnout', 'users', 'burnout_logs')
    `);
    const existing = new Set(rows.map((r) => r.tablename));

    if (existing.has('burnout') && existing.has('users') && existing.has('burnout_logs')) {
      console.log('[dbBootstrap] Todas as tabelas essenciais já existem — skip.');
      return;
    }

    console.log('[dbBootstrap] Tabelas faltando. Executando scripts de inicialização...');

    // 1. Script principal (burnout + extensão vector + trigger + dados)
    if (!existing.has('burnout')) {
      const initSql = fs.readFileSync(
        path.join(__dirname, 'scripts', 'init_and_insert_burnout.sql'),
        'utf8'
      );
      await client.query(initSql);
      console.log('[dbBootstrap] init_and_insert_burnout.sql executado.');
    }

    // 2. Tabelas users e burnout_logs
    if (!existing.has('users') || !existing.has('burnout_logs')) {
      const logsSql = fs.readFileSync(
        path.join(__dirname, 'scripts', 'init_burnout_logs_and_users.sql'),
        'utf8'
      );
      await client.query(logsSql);
      console.log('[dbBootstrap] init_burnout_logs_and_users.sql executado.');
    }

    console.log('[dbBootstrap] Inicialização do banco concluída com sucesso.');
  } catch (err) {
    console.error('[dbBootstrap] Erro ao inicializar o banco:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = bootstrap;
