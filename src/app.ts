/* SmartCare Rwanda browser-only TypeScript application. */

declare const supabase: {
  createClient: (url: string, key: string) => SupabaseClientLike;
};

declare const emailjs: {
  init: (options: { publicKey: string }) => void;
  send: (serviceId: string, templateId: string, templateParams: Record<string, string>) => Promise<{ status: number; text: string }>;
};

interface QueuePatient {
  id?: string;
  patient_name: string;
  email: string;
  hospital_name: string;
  ticket_number: string;
  status: 'waiting' | 'serving' | 'completed';
  created_at: string;
}

interface SupabaseResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface SupabaseQuery<T> {
  select: (columns?: string) => SupabaseQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQuery<T>;
  insert: (values: Partial<T> | Partial<T>[]) => Promise<SupabaseResult<T[]>>;
  update: (values: Partial<T>) => SupabaseQuery<T>;
  eq: (column: string, value: string) => Promise<SupabaseResult<T[]>>;
  then: <TResult1 = SupabaseResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => PromiseLike<TResult1 | TResult2>;
}

interface SupabaseChannel {
  on: (
    event: 'postgres_changes',
    config: { event: 'INSERT' | 'UPDATE'; schema: string; table: string },
    callback: (payload: { new: QueuePatient }) => void
  ) => SupabaseChannel;
  subscribe: (callback?: (status: string) => void) => SupabaseChannel;
}

interface SupabaseClientLike {
  from: <T>(table: string) => SupabaseQuery<T>;
  channel: (name: string) => SupabaseChannel;
}

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY';

const EMAILJS_PUBLIC_KEY = 'YOUR_EMAILJS_PUBLIC_KEY';
const EMAILJS_SERVICE_ID = 'YOUR_EMAILJS_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_EMAILJS_TEMPLATE_ID';

const HOSPITALS: Record<string, string> = {
  'la-charite': 'Polyclinique La Charité',
};

const isPlaceholder = (value: string): boolean =>
  !value || value.startsWith('YOUR_') || value.includes('REPLACE_ME');

const hasSupabaseConfig = (): boolean =>
  !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_KEY);

const hasEmailJsConfig = (): boolean =>
  !isPlaceholder(EMAILJS_PUBLIC_KEY) &&
  !isPlaceholder(EMAILJS_SERVICE_ID) &&
  !isPlaceholder(EMAILJS_TEMPLATE_ID);

const getSupabaseClient = (): SupabaseClientLike | null => {
  if (!hasSupabaseConfig()) return null;
  return supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return map[char];
  });

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const setText = (id: string, text: string): void => {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
};

const showElement = (id: string, show: boolean): void => {
  const element = document.getElementById(id);
  if (element) element.classList.toggle('hidden', !show);
};

const setAlert = (id: string, message: string, visible = true): void => {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('hidden', !visible);
};

const resolveHospitalFromUrl = (): string => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('hospital') ?? 'la-charite';
  return HOSPITALS[code] ?? HOSPITALS['la-charite'];
};

const getSessionTicketStore = (): string[] => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem('smartcare_used_tickets') ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const saveSessionTicket = (ticket: string): void => {
  try {
    const tickets = getSessionTicketStore();
    tickets.push(ticket);
    sessionStorage.setItem('smartcare_used_tickets', JSON.stringify(tickets.slice(-200)));
  } catch {
    // Ignore storage failures; ticket uniqueness is best-effort for this demo.
  }
};

const generateTicket = (): string => {
  const used = new Set(getSessionTicketStore());
  let ticket = '';
  let attempts = 0;
  do {
    const number = Math.floor(Math.random() * 900) + 100;
    ticket = `A-${number}`;
    attempts += 1;
  } while (used.has(ticket) && attempts < 20);

  saveSessionTicket(ticket);
  return ticket;
};

const initRegistrationPage = (): void => {
  const form = document.getElementById('registrationForm') as HTMLFormElement | null;
  if (!form) return;

  const hospitalName = resolveHospitalFromUrl();
  const hospitalDisplay = document.getElementById('hospitalNameDisplay');
  const hospitalInput = document.getElementById('hospitalName') as HTMLInputElement | null;
  if (hospitalDisplay) hospitalDisplay.textContent = hospitalName;
  if (hospitalInput) hospitalInput.value = hospitalName;

  const supabaseClient = getSupabaseClient();
  const formErrorId = 'formError';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setAlert(formErrorId, '', false);

    const patientNameInput = document.getElementById('patientName') as HTMLInputElement | null;
    const emailInput = document.getElementById('email') as HTMLInputElement | null;
    const phoneInput = document.getElementById('phone') as HTMLInputElement | null;
    const reasonInput = document.getElementById('reason') as HTMLTextAreaElement | null;
    const submitButton = document.getElementById('submitButton') as HTMLButtonElement | null;
    const submitLabel = document.getElementById('submitLabel');
    const submitSpinner = document.getElementById('submitSpinner');

    const patientName = patientNameInput?.value.trim() ?? '';
    const email = emailInput?.value.trim() ?? '';
    const phone = phoneInput?.value.trim() ?? '';
    const reason = reasonInput?.value.trim() ?? '';

    if (!patientName || !email) {
      setAlert(formErrorId, 'Please enter the patient name and a valid email address.');
      return;
    }

    if (!emailInput?.checkValidity()) {
      setAlert(formErrorId, 'Please enter a valid email address.');
      return;
    }

    if (!supabaseClient) {
      setAlert(formErrorId, 'Supabase is not configured yet. Replace the Supabase placeholders in src/app.ts and compile again.');
      return;
    }

    if (submitButton) submitButton.disabled = true;
    if (submitLabel) submitLabel.textContent = 'Registering…';
    showElement('submitSpinner', true);

    const ticketNumber = generateTicket();

    const { data, error } = await supabaseClient.from<QueuePatient>('queue').insert({
      patient_name: patientName,
      email,
      hospital_name: hospitalName,
      ticket_number: ticketNumber,
      status: 'waiting',
    });

    if (error || !data) {
      setAlert(formErrorId, `Registration failed: ${error?.message ?? 'No database response received.'}`);
      if (submitButton) submitButton.disabled = false;
      if (submitLabel) submitLabel.textContent = 'Get My Queue Ticket';
      showElement('submitSpinner', false);
      return;
    }

    form.reset();
    if (hospitalInput) hospitalInput.value = hospitalName;
    setText('ticketNumber', ticketNumber);
    setText('successHospital', hospitalName);
    showElement('formView', false);
    showElement('successView', true);

    const emailStatus = document.getElementById('emailStatus');

    if (hasEmailJsConfig()) {
      try {
        emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          to_email: email,
          patient_name: patientName,
          hospital_name: hospitalName,
          ticket_number: ticketNumber,
          status: 'Waiting',
          phone,
          reason,
        });
        if (emailStatus) {
          emailStatus.textContent = `A confirmation email was sent to ${email}.`;
          emailStatus.className = 'mx-auto mt-5 max-w-sm rounded-2xl bg-emerald-50 p-4 text-left text-xs font-semibold leading-5 text-emerald-800';
        }
      } catch (emailError) {
        console.error('EmailJS failed after successful registration:', emailError);
        if (emailStatus) {
          emailStatus.textContent = 'Registration is confirmed. The email service could not send a message in this demo, but your queue ticket remains valid.';
          emailStatus.className = 'mx-auto mt-5 max-w-sm rounded-2xl bg-amber-50 p-4 text-left text-xs font-semibold leading-5 text-amber-800';
        }
      }
    } else if (emailStatus) {
      emailStatus.textContent = 'Registration is confirmed. Add your EmailJS credentials in src/app.ts to enable confirmation emails.';
      emailStatus.className = 'mx-auto mt-5 max-w-sm rounded-2xl bg-slate-50 p-4 text-left text-xs font-semibold leading-5 text-slate-600';
    }
  });

  const newRegistrationButton = document.getElementById('newRegistrationButton');
  newRegistrationButton?.addEventListener('click', () => {
    showElement('successView', false);
    showElement('formView', true);
    setText('emailStatus', 'A confirmation email is being prepared.');
    const status = document.getElementById('emailStatus');
    if (status) status.className = 'mx-auto mt-5 max-w-sm rounded-2xl bg-sky-50 p-4 text-left text-xs font-semibold leading-5 text-sky-800';
    const submitButton = document.getElementById('submitButton') as HTMLButtonElement | null;
    const submitLabel = document.getElementById('submitLabel');
    if (submitButton) submitButton.disabled = false;
    if (submitLabel) submitLabel.textContent = 'Get My Queue Ticket';
    showElement('submitSpinner', false);
    const firstInput = document.getElementById('patientName') as HTMLInputElement | null;
    firstInput?.focus();
  });
};

const adminState: { patients: QueuePatient[]; realtimeStarted: boolean } = {
  patients: [],
  realtimeStarted: false,
};

const sortNewestFirst = (): void => {
  adminState.patients.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

const upsertPatient = (patient: QueuePatient): void => {
  const existingIndex = adminState.patients.findIndex((item) => item.id === patient.id);
  if (existingIndex >= 0) {
    adminState.patients[existingIndex] = { ...adminState.patients[existingIndex], ...patient };
  } else {
    adminState.patients.unshift(patient);
  }
  sortNewestFirst();
};

const renderAdmin = (): void => {
  const waiting = adminState.patients.filter((patient) => patient.status === 'waiting').length;
  const serving = adminState.patients.filter((patient) => patient.status === 'serving').length;
  const completed = adminState.patients.filter((patient) => patient.status === 'completed').length;

  setText('waitingCount', String(waiting));
  setText('servingCount', String(serving));
  setText('completedCount', String(completed));
  setText('totalCount', String(adminState.patients.length));
  setText('lastUpdated', new Date().toLocaleTimeString());

  const tableBody = document.getElementById('queueTableBody');
  const loading = document.getElementById('queueLoading');
  const empty = document.getElementById('queueEmpty');
  const tableWrap = document.getElementById('queueTableWrap');
  if (!tableBody || !loading || !empty || !tableWrap) return;

  loading.classList.add('hidden');

  if (adminState.patients.length === 0) {
    empty.classList.remove('hidden');
    tableWrap.classList.add('hidden');
    tableBody.innerHTML = '';
    return;
  }

  empty.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  tableBody.innerHTML = adminState.patients.map((patient) => {
    const statusClass = patient.status === 'waiting'
      ? 'bg-amber-50 text-amber-700'
      : patient.status === 'serving'
        ? 'bg-sky-50 text-sky-700'
        : 'bg-emerald-50 text-emerald-700';

    const actionButton = patient.status === 'waiting'
      ? `<button data-action="serve" data-id="${escapeHtml(patient.id ?? '')}" class="rounded-xl bg-sky-700 px-3 py-2 text-xs font-black text-white hover:bg-sky-800">Call next</button>`
      : patient.status === 'serving'
        ? `<button data-action="complete" data-id="${escapeHtml(patient.id ?? '')}" class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">Complete</button>`
        : `<span class="text-xs font-bold text-slate-400">Done</span>`;

    return `
      <tr data-row-id="${escapeHtml(patient.id ?? '')}" class="group transition hover:bg-slate-50">
        <td class="whitespace-nowrap px-5 py-4 sm:px-6"><div class="text-base font-black text-slate-950">${escapeHtml(patient.ticket_number)}</div></td>
        <td class="px-5 py-4 sm:px-6"><div class="font-extrabold text-slate-800">${escapeHtml(patient.patient_name)}</div><div class="mt-1 text-xs text-slate-400">${escapeHtml(patient.email)}</div></td>
        <td class="px-5 py-4 text-sm font-semibold text-slate-600 sm:px-6">${escapeHtml(patient.hospital_name)}</td>
        <td class="px-5 py-4 sm:px-6"><span class="rounded-full px-3 py-1.5 text-xs font-black ${statusClass}">${escapeHtml(patient.status)}</span></td>
        <td class="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-500 sm:px-6">${escapeHtml(formatDateTime(patient.created_at))}</td>
        <td class="whitespace-nowrap px-5 py-4 sm:px-6">${actionButton}</td>
      </tr>`;
  }).join('');
};

const showNewPatientNotice = (patient: QueuePatient): void => {
  const notice = document.getElementById('adminNotice');
  if (!notice) return;
  notice.textContent = `New patient: ${patient.ticket_number} · ${patient.patient_name} just joined the queue.`;
  notice.classList.remove('hidden');
  window.setTimeout(() => notice.classList.add('hidden'), 5000);
};

const initAdminDashboard = async (): Promise<void> => {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    setAlert('adminError', 'Supabase is not configured yet. Replace the Supabase placeholders in src/app.ts and compile again.');
    setText('connectionBadge', '● Not configured');
    setText('queueLoading', 'Configuration required.');
    return;
  }

  const loadResult = await supabaseClient.from<QueuePatient>('queue').select('*').order('created_at', { ascending: false });
  if (loadResult.error) {
    setAlert('adminError', `Unable to load queue: ${loadResult.error.message}`);
  } else {
    adminState.patients = loadResult.data ?? [];
    sortNewestFirst();
    renderAdmin();
  }

  const channel = supabaseClient
    .channel('smartcare-queue-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'queue' }, (payload) => {
      const patient = payload.new;
      upsertPatient(patient);
      renderAdmin();
      showNewPatientNotice(patient);
      const row = document.querySelector(`[data-row-id="${CSS.escape(patient.id ?? '')}"]`);
      row?.classList.add('bg-emerald-50');
      window.setTimeout(() => row?.classList.remove('bg-emerald-50'), 4500);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'queue' }, (payload) => {
      upsertPatient(payload.new);
      renderAdmin();
    })
    .subscribe((status) => {
      adminState.realtimeStarted = status === 'SUBSCRIBED';
      const badge = document.getElementById('connectionBadge');
      if (!badge) return;
      if (status === 'SUBSCRIBED') {
        badge.textContent = '● Live';
        badge.className = 'rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-700';
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        badge.textContent = '● Realtime error';
        badge.className = 'rounded-2xl bg-red-50 px-4 py-2.5 text-xs font-black text-red-700';
      } else {
        badge.textContent = `● ${status}`;
        badge.className = 'rounded-2xl bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-700';
      }
    });

  document.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement | null;
    const actionButton = target?.closest<HTMLButtonElement>('[data-action]');
    if (!actionButton) return;

    const id = actionButton.dataset.id;
    const action = actionButton.dataset.action;
    if (!id || !action) return;

    const nextStatus: QueuePatient['status'] = action === 'serve' ? 'serving' : 'completed';
    actionButton.disabled = true;
    actionButton.classList.add('opacity-50');

    const { error } = await supabaseClient
      .from<QueuePatient>('queue')
      .update({ status: nextStatus })
      .eq('id', id);

    if (error) {
      setAlert('adminError', `Could not update queue status: ${error.message}`);
      actionButton.disabled = false;
      actionButton.classList.remove('opacity-50');
    }
  });
};

const initClock = (): void => {
  const update = (): void => {
    setText('currentClock', new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date()));
  };
  update();
  window.setInterval(update, 1000);
};

const initApp = (): void => {
  const page = document.body.dataset.page;
  if (page === 'register') initRegistrationPage();
  if (page === 'admin') {
    void initAdminDashboard();
    initClock();
  }
};

document.addEventListener('DOMContentLoaded', initApp);
