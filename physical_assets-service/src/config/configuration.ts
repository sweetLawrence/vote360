export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  botSecret: process.env.BOT_SECRET,
  reconciliationUrl: process.env.RECONCILIATION_URL,
});
