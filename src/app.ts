/* SmartCare Rwanda browser application. Public configuration is intentional; privileged keys stay server-side. */

declare const supabase: {
  createClient: (url: string, key: string) => SupabaseClientLike;
};

declare const emailjs: {
  init: (options: { publicKey: string }) => void;
  send: (
    serviceId: string,
    templateId: string,
    templateParams: Record<string, string>,
  ) => Promise<{ status: number; text: string }>;
};

interface PublicConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  emailJsPublicKey: string;
  emailJsServiceId: string;
  emailJsTemplateId: string;
}

interface Window {
  SMARTCARE_CONFIG?: Partial<PublicConfig>;
}

interface QueuePatient {
  id: string;
  patient_name: string;
  email: string;
  hospital_name: string;
  ticket_number: string;
  status: 'waiting' | 'serving' | 'completed';
  created_at: string;
}

interface SupabaseError {
  message: string;
}

interface SupabaseResult<T> {
  data: T | null;
  error: SupabaseError | null;
}

interface SupabaseQuery<T> extends PromiseLike<SupabaseResult<T[]>> {
  select: (columns?: string) => SupabaseQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQuery<T>;
  update: (values: Partial<T>) => SupabaseQuery<T>;
  eq: (column: string, value: string) => Promise<SupabaseResult<T[]>>;
}

interface SupabaseChannel {
  on: (
    event: 'postgres_changes',
    config: { event: 'INSERT' | 'UPDATE'; schema: string; table: string },
    callback: (payload: { new: QueuePatient }) => void,
  ) => SupabaseChannel;
  subscribe: (callback?: (status: string) => void) => SupabaseChannel;
}

interface SupabaseClientLike {
  from: <T>(table: string) => SupabaseQuery<T>;
  rpc: <T>(
    fn: string,
    params: Record<string, string>,
  ) => Promise<SupabaseResult<T | T[]>>;
  channel: (name: string) => SupabaseChannel;
  auth: {
    getUser: () => Promise<{
      data: { user: { app_metadata?: Record<string, unknown> } | null };
      error: SupabaseError | null;
    }>;
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => Promise<{ error: SupabaseError | null }>;
    signOut: () => Promise<{ error: SupabaseError | null }>;
  };
}

const CONFIG: PublicConfig = {
  supabaseUrl: window.SMARTCARE_CONFIG?.supabaseUrl ?? '',
  supabaseAnonKey: window.SMARTCARE_CONFIG?.supabaseAnonKey ?? '',
  emailJsPublicKey: window.SMARTCARE_CONFIG?.emailJsPublicKey ?? '',
  emailJsServiceId: window.SMARTCARE_CONFIG?.emailJsServiceId ?? '',
  emailJsTemplateId: window.SMARTCARE_CONFIG?.emailJsTemplateId ?? '',
};

const HOSPITALS: Record<string, string> = {
  'la-charite': 'Polyclinique La Charité',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isConfigured = (value: string): boolean =>
  Boolean(value) && !value.startsWith('YOUR_') && !value.includes('REPLACE_ME');

const getSupabaseClient = (): SupabaseClientLike | null =>
  isConfigured(CONFIG.supabaseUrl) && isConfigured(CONFIG.supabaseAnonKey)
    ? supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey)
    : null;

const hasEmailJsConfig = (): boolean =>
  [
    CONFIG.emailJsPublicKey,
    CONFIG.emailJsServiceId,
    CONFIG.emailJsTemplateId,
  ].every(isConfigured);

const setText = (id: string, value: string): void => {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
};

const setVisible = (id: string, visible: boolean): void => {
  document.getElementById(id)?.classList.toggle('hidden', !visible);
};

const setAlert = (id: string, message = ''): void => {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = message;
    element.classList.toggle('hidden', !message);
  }
};

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );

const formatDateTime = (value: string): string => {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
};

const resolveHospitalFromUrl = (): string =>
  HOSPITALS[
    new URLSearchParams(window.location.search).get('hospital') ?? 'la-charite'
  ] ?? HOSPITALS['la-charite'];

const toUserMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.toLowerCase().includes('network')
    ? 'Network connection failed. Please try again.'
    : fallback;

const initRegistrationPage = (): void => {
  const form = document.getElementById(
    'registrationForm',
  ) as HTMLFormElement | null;

  if (!form) {
    return;
  }

  const hospitalName = resolveHospitalFromUrl();
  setText('hospitalNameDisplay', hospitalName);

  const hospitalInput = document.getElementById(
    'hospitalName',
  ) as HTMLInputElement | null;

  if (hospitalInput) {
    hospitalInput.value = hospitalName;
  }

  const client = getSupabaseClient();
  let submitting = false;

  const setSubmitting = (value: boolean): void => {
    const button = document.getElementById(
      'submitButton',
    ) as HTMLButtonElement | null;

    if (button) {
      button.disabled = value;
    }

    setText('submitLabel', value ? 'Registering…' : 'Get My Queue Ticket');
    setVisible('submitSpinner', value);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setAlert('formError');

    const patientName =
      (document.getElementById('patientName') as HTMLInputElement | null)?.value.trim() ?? '';
    const emailInput = document.getElementById(
      'email',
    ) as HTMLInputElement | null;
    const email = emailInput?.value.trim().toLowerCase() ?? '';
    const phone =
      (document.getElementById('phone') as HTMLInputElement | null)?.value.trim() ?? '';
    const reason =
      (document.getElementById('reason') as HTMLTextAreaElement | null)?.value.trim() ?? '';

    if (
      !patientName ||
      !email ||
      !emailInput?.checkValidity() ||
      !EMAIL_PATTERN.test(email)
    ) {
      setAlert('formError', 'Enter a patient name and a valid email address.');
      return;
    }

    if (
      patientName.length > 120 ||
      email.length > 160 ||
      phone.length > 30 ||
      reason.length > 500
    ) {
      setAlert('formError', 'One or more fields exceed the allowed length.');
      return;
    }

    if (!client) {
      setAlert(
        'formError',
        'Registration is unavailable because the service is not configured.',
      );
      return;
    }

    submitting = true;
    setSubmitting(true);

    try {
      const result = await client.rpc<QueuePatient>('register_queue_patient', {
        p_patient_name: patientName,
        p_email: email,
        p_hospital_name: hospitalName,
        p_phone: phone,
        p_reason: reason,
      });

      const patient = Array.isArray(result.data) ? result.data[0] : result.data;

      if (result.error || !patient) {
        throw new Error(
          result.error?.message ?? 'The registration service returned no ticket.',
        );
      }

      setText('ticketNumber', patient.ticket_number);
      setText('successHospital', patient.hospital_name);
      setVisible('formView', false);
      setVisible('successView', true);

      form.reset();

      if (hospitalInput) {
        hospitalInput.value = hospitalName;
      }

      const emailStatus = document.getElementById('emailStatus');

      if (!hasEmailJsConfig()) {
        if (emailStatus) {
          emailStatus.textContent =
            'Registration is confirmed, but the confirmation email service is unavailable.';
        }

        return;
      }

      try {
        emailjs.init({ publicKey: CONFIG.emailJsPublicKey });

        await emailjs.send(CONFIG.emailJsServiceId, CONFIG.emailJsTemplateId, {
          email,
          patient_name: patient.patient_name,
          hospital_name: patient.hospital_name,
          ticket_number: patient.ticket_number,
          status: 'Waiting',
          phone,
          reason,
        });

        if (emailStatus) {
          emailStatus.textContent = `A confirmation email was sent to ${email}.`;
          emailStatus.className =
            'mx-auto mt-5 max-w-sm rounded-2xl bg-emerald-50 p-4 text-left text-xs font-semibold leading-5 text-emerald-800';
        }
      } catch {
        if (emailStatus) {
          emailStatus.textContent =
            'Registration is confirmed, but we could not send the confirmation email. Your queue ticket remains valid.';
          emailStatus.className =
            'mx-auto mt-5 max-w-sm rounded-2xl bg-amber-50 p-4 text-left text-xs font-semibold leading-5 text-amber-800';
        }
      }
    } catch (error) {
      setAlert(
        'formError',
        toUserMessage(
          error,
          'We could not complete your registration. Please try again.',
        ),
      );
    } finally {
      submitting = false;
      setSubmitting(false);
    }
  });

  document.getElementById('newRegistrationButton')?.addEventListener('click', () => {
    setVisible('successView', false);
    setVisible('formView', true);
    setAlert('formError');
    setText('emailStatus', 'A confirmation email is being prepared.');

    (
      document.getElementById('patientName') as HTMLInputElement | null
    )?.focus();
  });
};

const adminState: { patients: QueuePatient[] } = {
  patients: [],
};

const renderAdmin = (): void => {
  const tableBody = document.getElementById('queueTableBody');

  if (!tableBody) {
    return;
  }

  const counts = ['waiting', 'serving', 'completed'].map(
    (status) =>
      adminState.patients.filter((patient) => patient.status === status).length,
  );

  setText('waitingCount', String(counts[0]));
  setText('servingCount', String(counts[1]));
  setText('completedCount', String(counts[2]));
  setText('totalCount', String(adminState.patients.length));
  setText('lastUpdated', new Date().toLocaleTimeString());

  setVisible('queueLoading', false);
  setVisible('queueEmpty', adminState.patients.length === 0);
  setVisible('queueTableWrap', adminState.patients.length > 0);

  tableBody.innerHTML = adminState.patients
    .map((patient) => {
      const statusClass =
        patient.status === 'waiting'
          ? 'bg-amber-50 text-amber-700'
          : patient.status === 'serving'
            ? 'bg-sky-50 text-sky-700'
            : 'bg-emerald-50 text-emerald-700';

      const action =
        patient.status === 'waiting'
          ? 'serve'
          : patient.status === 'serving'
            ? 'complete'
            : '';

      const actionLabel =
        action === 'serve'
          ? 'Call next'
          : action === 'complete'
            ? 'Complete'
            : 'Done';

      const actionButton = action
        ? `<button data-action="${action}" data-id="${escapeHtml(patient.id)}" class="rounded-xl bg-sky-700 px-3 py-2 text-xs font-black text-white hover:bg-sky-800">${actionLabel}</button>`
        : '<span class="text-xs font-bold text-slate-400">Done</span>';

      return `<tr><td class="whitespace-nowrap px-5 py-4 sm:px-6"><div class="text-base font-black text-slate-950">${escapeHtml(patient.ticket_number)}</div></td><td class="px-5 py-4 sm:px-6"><div class="font-extrabold text-slate-800">${escapeHtml(patient.patient_name)}</div><div class="mt-1 text-xs text-slate-400">${escapeHtml(patient.email)}</div></td><td class="px-5 py-4 text-sm font-semibold text-slate-600 sm:px-6">${escapeHtml(patient.hospital_name)}</td><td class="px-5 py-4 sm:px-6"><span class="rounded-full px-3 py-1.5 text-xs font-black ${statusClass}">${escapeHtml(patient.status)}</span></td><td class="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-500 sm:px-6">${escapeHtml(formatDateTime(patient.created_at))}</td><td class="whitespace-nowrap px-5 py-4 sm:px-6">${actionButton}</td></tr>`;
    })
    .join('');
};

const initAdminDashboard = async (): Promise<void> => {
  const client = getSupabaseClient();

  if (!client) {
    setAlert(
      'adminError',
      'The dashboard is unavailable because the service is not configured.',
    );
    setText('queueLoading', 'Configuration required.');
    return;
  }

  try {
    const userResult = await client.auth.getUser();
    const role = userResult.data.user?.app_metadata?.role;

    if (userResult.error || role !== 'queue_admin') {
      throw new Error('Unauthorized administrator.');
    }

    const result = await client
      .from<QueuePatient>('queue')
      .select(
        'id,patient_name,email,hospital_name,ticket_number,status,created_at',
      )
      .order('created_at', { ascending: false });

    if (result.error) {
      throw new Error(result.error.message);
    }

    adminState.patients = result.data ?? [];
    renderAdmin();

    client
      .channel('smartcare-queue-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'queue' },
        ({ new: patient }) => {
          adminState.patients = [
            patient,
            ...adminState.patients.filter((item) => item.id !== patient.id),
          ];
          renderAdmin();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'queue' },
        ({ new: patient }) => {
          adminState.patients = adminState.patients.map((item) =>
            item.id === patient.id ? patient : item,
          );
          renderAdmin();
        },
      )
      .subscribe((status) => {
        const badge = document.getElementById('connectionBadge');

        if (badge) {
          badge.textContent = status === 'SUBSCRIBED' ? '● Live' : `● ${status}`;
        }
      });

    document.addEventListener('click', async (event) => {
      const button = (
        event.target as HTMLElement | null
      )?.closest<HTMLButtonElement>('[data-action]');

      const id = button?.dataset.id;
      const action = button?.dataset.action;

      if (
        !button ||
        !id ||
        (action !== 'serve' && action !== 'complete')
      ) {
        return;
      }

      button.disabled = true;

      try {
        const result = await client
          .from<QueuePatient>('queue')
          .update({ status: action === 'serve' ? 'serving' : 'completed' })
          .eq('id', id);

        if (result.error) {
          throw new Error(result.error.message);
        }
      } catch {
        setAlert('adminError', 'Could not update the queue. Please try again.');
        button.disabled = false;
      }
    });
  } catch {
    setAlert(
      'adminError',
      'Unable to load the queue. Confirm that you are signed in as an authorized queue administrator.',
    );
    setText('queueLoading', 'Queue unavailable.');
  }
};

const initAdminAuthentication = (): void => {
  const client = getSupabaseClient();
  const form = document.getElementById(
    'adminLoginForm',
  ) as HTMLFormElement | null;
  const logoutButton = document.getElementById(
    'adminLogoutButton',
  ) as HTMLButtonElement | null;

  if (!client || !form) {
    return;
  }

  const syncUi = async (): Promise<void> => {
    const userResult = await client.auth.getUser();
    const signedIn =
      !userResult.error &&
      userResult.data.user?.app_metadata?.role === 'queue_admin';

    setVisible('adminLoginForm', !signedIn);
    setVisible('adminLogoutButton', signedIn);
  };

  void syncUi();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email =
      (
        document.getElementById('adminEmail') as HTMLInputElement | null
      )?.value.trim().toLowerCase() ?? '';

    const password =
      (document.getElementById('adminPassword') as HTMLInputElement | null)
        ?.value ?? '';

    if (!EMAIL_PATTERN.test(email) || !password) {
      setAlert(
        'adminError',
        'Enter your administrator email and password.',
      );
      return;
    }

    const button = document.getElementById(
      'adminLoginButton',
    ) as HTMLButtonElement | null;

    if (button) {
      button.disabled = true;
    }

    try {
      const result = await client.auth.signInWithPassword({ email, password });

      if (result.error) {
        throw new Error(result.error.message);
      }

      const userResult = await client.auth.getUser();

      if (userResult.data.user?.app_metadata?.role !== 'queue_admin') {
        await client.auth.signOut();
        throw new Error('Unauthorized administrator.');
      }

      window.location.reload();
    } catch {
      setAlert(
        'adminError',
        'Sign-in failed or this account is not authorized for queue administration.',
      );
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  });

  logoutButton?.addEventListener('click', async () => {
    await client.auth.signOut();
    window.location.reload();
  });
};

const initApp = (): void => {
  if (document.body.dataset.page === 'register') {
    initRegistrationPage();
  }

  if (document.body.dataset.page === 'admin') {
    initAdminAuthentication();
    void initAdminDashboard();

    const updateClock = (): void => {
      setText(
        'currentClock',
        new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(new Date()),
      );
    };

    updateClock();
    window.setInterval(updateClock, 1000);
  }
};

document.addEventListener('DOMContentLoaded', initApp);
