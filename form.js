/* Kontaktformular: sendet an n8n, ohne Seitenwechsel. Spam-Schutz per Honeypot + Mindestzeit. */
(() => {
  const form = document.querySelector('.cform');
  if (!form) return;
  const msg = form.querySelector('.cform-msg');
  const btn = form.querySelector('button[type=submit]');
  form.t0.value = Date.now();

  // Firma nur bei „Beruflich“
  // Beispieltext passend zu beruflich/privat
  const PH = {
    Beruflich: 'z. B. „Bestellungen tippen wir heute von Hand ins Warenwirtschaftssystem ab.“',
    Privat: 'z. B. „Bei blendendem Licht soll das Rollo herunterfahren – bei günstigem Strom die Waschmaschine starten.“',
  };
  const syncArt = () => {
    const privat = form.art.value === 'Privat';
    form.classList.toggle('privat', privat);
    form.nachricht.placeholder = PH[privat ? 'Privat' : 'Beruflich'];
  };
  form.addEventListener('change', e => { if (e.target.name === 'art') syncArt(); });
  syncArt();

  const say = (text, ok) => { msg.textContent = text; msg.className = 'cform-msg ' + (ok ? 'ok' : 'err'); };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.thema.value) return say('Bitte wählen Sie ein Thema.', false);
    if (!form.name.value.trim()) { form.name.focus(); return say('Bitte geben Sie Ihren Namen an.', false); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim())) { form.email.focus(); return say('Bitte prüfen Sie die E-Mail-Adresse.', false); }

    btn.disabled = true; btn.textContent = 'Wird gesendet …'; say('', true);
    try {
      const body = new URLSearchParams(new FormData(form));
      if (form.art.value === 'Privat') body.delete('firma');
      const r = await fetch(form.action, { method: 'POST', body });   // einfacher Request, kein Preflight
      if (!r.ok) throw new Error(r.status);
      form.classList.add('sent');
      form.innerHTML = '<div class="cform-done"><span class="tag phys">Angekommen</span><h3>Danke, ' +
        String(body.get('name')).replace(/[<>&"]/g, '').split(' ')[0] +
        '!</h3><p>Ihre Anfrage ist bei uns eingegangen. Wir melden uns in Kürze – meist per E-Mail, auf Wunsch telefonisch.</p></div>';
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Anfrage senden';
      say('Das hat leider nicht geklappt. Schreiben Sie uns gern direkt an walkthewalk@sequa-licht.de.', false);
    }
  });
})();
