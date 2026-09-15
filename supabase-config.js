window.__REMOTE_ADMIN_MODE__ = true;
(function () {
  const c = window.NURIM_CONFIG || {};
  if (!c.supabaseUrl || !c.publishableKey) { window.location.replace("/demo.html"); return; }
  window.INCHEON_SUPABASE = Object.freeze({url:c.supabaseUrl,publishableKey:c.publishableKey});
})();
