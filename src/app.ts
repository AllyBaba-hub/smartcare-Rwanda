// ============================================================
// SMARTCARE RWANDA - OPCODEX LTD
// Main TypeScript Application
// ============================================================


// ============================================================
// TYPES
// ============================================================

interface Address {
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
}


interface FileMetadata {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}


interface FileUploads {
  identificationDocument: FileMetadata | null;
  insuranceDocument: FileMetadata | null;
}


interface Dependent {
  fullName: string;
  relationship: string;
}


interface PatientRegistration {
  hospitalId: string;

  primarySponsor: {
    fullName: string;
    nin: string;
    dateOfBirth: string;
    occupation: string;
    phone: string;
    email: string;
  };

  address: Address;

  dependent: Dependent | null;

  insurance: {
    provider: string;
    policyId: string;
  };

  documents: FileUploads;

  visit: {
    date: string;
    department: string;
  };

  submittedAt: string;
}


interface Hospital {
  id: string;
  name: string;
  location: string;
  district: string;
  province: string;
  specialties: string[];
  insurance: string[];
  description: string;
  registrationUrl: string;
}


// ============================================================
// HOSPITAL DATA
// ============================================================

const hospitals: Hospital[] = [

  {
    id: "la-charite",

    name: "Polyclinique La Charité",

    location: "Rubavu / Gisenyi, Western Province",

    district: "Rubavu",

    province: "Western Province",

    specialties: [
      "General Consultation",
      "Pediatrics",
      "Maternity",
      "Laboratory",
      "Emergency Care"
    ],

    insurance: [
      "Mutuelle de Santé (CBHI)",
      "RSSB / RAMA",
      "Eden Care",
      "Sanlam",
      "UAP",
      "Radiant",
      "Cash / Self-Pay"
    ],

    description:
      "A SmartCare Rwanda partner facility where patients can begin the digital registration workflow.",

    registrationUrl:
      "register.html?hospital=la-charite"
  }

];


// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function getElement<T extends HTMLElement>(
  selector: string
): T | null {

  return document.querySelector<T>(selector);
}


function escapeHtml(value: string): string {

  const div = document.createElement("div");

  div.textContent = value;

  return div.innerHTML;
}


function formatFileSize(bytes: number): string {

  if (bytes === 0) {
    return "0 Bytes";
  }

  const units = [
    "Bytes",
    "KB",
    "MB",
    "GB"
  ];

  const index = Math.floor(
    Math.log(bytes) / Math.log(1024)
  );

  return `${(
    bytes / Math.pow(1024, index)
  ).toFixed(2)} ${units[index]}`;
}


function fileToMetadata(
  file: File | null
): FileMetadata | null {

  if (!file) {
    return null;
  }

  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified
  };
}


// ============================================================
// URL / HOSPITAL SELECTION
// ============================================================

function getHospitalFromQuery(): Hospital | null {

  const params = new URLSearchParams(
    window.location.search
  );

  const hospitalId = params.get("hospital");

  if (!hospitalId) {
    return null;
  }

  return (
    hospitals.find(
      hospital => hospital.id === hospitalId
    ) ?? null
  );
}


// ============================================================
// HOSPITAL PAGE
// ============================================================

function initializeHospitalPage(): void {

  const hospitalGrid =
    getElement<HTMLDivElement>("#hospitalGrid");

  if (!hospitalGrid) {
    return;
  }


  const searchInput =
    getElement<HTMLInputElement>("#hospitalSearch");

  const districtFilter =
    getElement<HTMLSelectElement>("#districtFilter");

  const noHospitals =
    getElement<HTMLDivElement>("#noHospitals");


  function renderHospitals(): void {

    const searchTerm =
      searchInput?.value
        .trim()
        .toLowerCase() ?? "";

    const district =
      districtFilter?.value ?? "all";


    const filtered =
      hospitals.filter(hospital => {

        const matchesSearch =
          hospital.name
            .toLowerCase()
            .includes(searchTerm) ||

          hospital.location
            .toLowerCase()
            .includes(searchTerm) ||

          hospital.specialties.some(
            specialty =>
              specialty
                .toLowerCase()
                .includes(searchTerm)
          );


        const matchesDistrict =
          district === "all" ||
          hospital.district === district;


        return (
          matchesSearch &&
          matchesDistrict
        );

      });


    hospitalGrid.innerHTML = "";


    if (filtered.length === 0) {

      noHospitals?.classList.remove("hidden");

      return;
    }


    noHospitals?.classList.add("hidden");


    filtered.forEach(
      hospital => {

        const card =
          document.createElement("article");

        card.className =
          "bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-lg transition";


        const specialtyHtml =
          hospital.specialties
            .map(
              specialty => `
                <span class="inline-flex px-3 py-1 rounded-full bg-sky-50 text-medical text-xs font-semibold">
                  ${escapeHtml(specialty)}
                </span>
              `
            )
            .join("");


        const insuranceHtml =
          hospital.insurance
            .map(
              provider => `
                <span class="text-xs text-slate-600">
                  ${escapeHtml(provider)}
                </span>
              `
            )
            .join(" · ");


        card.innerHTML = `

          <div class="h-40 bg-gradient-to-br from-navy to-medical flex items-center justify-center">

            <div class="h-20 w-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-4xl">
              🏥
            </div>

          </div>


          <div class="p-6">

            <div class="flex items-start justify-between gap-3">

              <div>

                <h2 class="text-xl font-bold text-navy">
                  ${escapeHtml(hospital.name)}
                </h2>

                <p class="mt-1 text-sm text-slate-500">
                  📍 ${escapeHtml(hospital.location)}
                </p>

              </div>

              <span class="shrink-0 text-xs font-bold bg-green-50 text-green-700 px-2 py-1 rounded-full">
                Partner
              </span>

            </div>


            <p class="mt-4 text-sm text-slate-600 leading-relaxed">
              ${escapeHtml(hospital.description)}
            </p>


            <h3 class="mt-5 text-sm font-bold text-navy">
              Available Services
            </h3>


            <div class="flex flex-wrap gap-2 mt-3">
              ${specialtyHtml}
            </div>


            <h3 class="mt-5 text-sm font-bold text-navy">
              Insurance / Payment
            </h3>


            <p class="mt-2 text-xs leading-5">
              ${insuranceHtml}
            </p>


            <a
              href="${hospital.registrationUrl}"
              class="mt-6 block text-center bg-medical hover:bg-sky-700 text-white py-3.5 rounded-xl font-bold transition"
            >
              Select & Register at This Hospital
            </a>

          </div>
        `;


        hospitalGrid.appendChild(card);

      }
    );

  }


  searchInput?.addEventListener(
    "input",
    renderHospitals
  );

  districtFilter?.addEventListener(
    "change",
    renderHospitals
  );


  renderHospitals();
}


// ============================================================
// REGISTRATION PAGE
// ============================================================

function initializeRegistrationPage(): void {

  const form =
    getElement<HTMLFormElement>(
      "#registrationForm"
    );

  if (!form) {
    return;
  }


  const hospital =
    getHospitalFromQuery();


  const hospitalName =
    getElement<HTMLElement>(
      "#selectedHospitalName"
    );

  const hospitalLocation =
    getElement<HTMLElement>(
      "#selectedHospitalLocation"
    );


  // ----------------------------------------------------------
  // No hospital selected
  // ----------------------------------------------------------

  if (!hospital) {

    if (hospitalName) {
      hospitalName.textContent =
        "No hospital selected";
    }

    if (hospitalLocation) {
      hospitalLocation.textContent =
        "Please return to the hospital directory.";
    }

    form.querySelectorAll(
      "input, select, button"
    ).forEach(
      element => {
        (element as HTMLInputElement |
          HTMLSelectElement |
          HTMLButtonElement).disabled = true;
      }
    );

    return;
  }


  // ----------------------------------------------------------
  // Display selected hospital
  // ----------------------------------------------------------

  if (hospitalName) {
    hospitalName.textContent =
      hospital.name;
  }

  if (hospitalLocation) {
    hospitalLocation.textContent =
      hospital.location;
  }


  // ----------------------------------------------------------
  // Date validation
  // ----------------------------------------------------------

  const visitDate =
    getElement<HTMLInputElement>(
      "#visitDate"
    );


  if (visitDate) {

    const today =
      new Date()
        .toISOString()
        .split("T")[0];

    visitDate.min = today;

  }


  // ----------------------------------------------------------
  // Form submission
  // ----------------------------------------------------------

  form.addEventListener(
    "submit",
    event => {

      event.preventDefault();


      if (!form.checkValidity()) {

        form.reportValidity();

        showFormMessage(
          "Please complete all required fields before submitting.",
          "error"
        );

        return;
      }


      const registration =
        collectRegistrationData(hospital);


      console.log(
        "SmartCare registration prototype:",
        registration
      );


      // Prototype persistence
      localStorage.setItem(
        "smartcare:lastRegistration",
        JSON.stringify(registration)
      );


      showFormMessage(
        `
          Registration captured successfully for
          <strong>${escapeHtml(hospital.name)}</strong>.
          In a production implementation, this information would
          now be securely transmitted to the SmartCare backend.
        `,
        "success"
      );


      form.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    }
  );


  // ----------------------------------------------------------
  // NIN input protection
  // ----------------------------------------------------------

  const nin =
    getElement<HTMLInputElement>(
      "#nin"
    );


  nin?.addEventListener(
    "input",
    () => {

      nin.value =
        nin.value
          .replace(/\D/g, "")
          .slice(0, 16);

    }
  );

}


// ============================================================
// COLLECT FORM DATA
// ============================================================

function collectRegistrationData(
  hospital: Hospital
): PatientRegistration {


  const getValue = (
    id: string
  ): string => {

    const element =
      document.getElementById(
        id
      ) as HTMLInputElement |
        HTMLSelectElement |
        null;

    return element?.value.trim() ?? "";

  };


  const identificationInput =
    getElement<HTMLInputElement>(
      "#idDocument"
    );


  const insuranceInput =
    getElement<HTMLInputElement>(
      "#insuranceDocument"
    );


  const dependentName =
    getValue(
      "dependentName"
    );


  const dependentRelationship =
    getValue(
      "relationship"
    );


  const registration: PatientRegistration = {

    hospitalId:
      hospital.id,


    primarySponsor: {

      fullName:
        getValue("fullName"),

      nin:
        getValue("nin"),

      dateOfBirth:
        getValue("dob"),

      occupation:
        getValue("occupation"),

      phone:
        getValue("phone"),

      email:
        getValue("email")

    },


    address: {

      province:
        getValue("province"),

      district:
        getValue("district"),

      sector:
        getValue("sector"),

      cell:
        getValue("cell"),

      village:
        getValue("village")

    },


    dependent:
      dependentName
        ? {
            fullName:
              dependentName,

            relationship:
              dependentRelationship
          }
        : null,


    insurance: {

      provider:
        getValue(
          "insuranceProvider"
        ),

      policyId:
        getValue(
          "policyId"
        )

    },


    documents: {

      identificationDocument:
        fileToMetadata(
          identificationInput?.files?.[0] ?? null
        ),

      insuranceDocument:
        fileToMetadata(
          insuranceInput?.files?.[0] ?? null
        )

    },


    visit: {

      date:
        getValue(
          "visitDate"
        ),

      department:
        getValue(
          "department"
        )

    },


    submittedAt:
      new Date().toISOString()

  };


  return registration;
}


// ============================================================
// FILE UPLOAD PREVIEW / METADATA
// ============================================================

function initializeFileInputs(): void {

  const fileInputs =
    document.querySelectorAll<HTMLInputElement>(
      'input[type="file"]'
    );


  fileInputs.forEach(
    input => {

      input.addEventListener(
        "change",
        () => {

          const file =
            input.files?.[0];


          if (!file) {
            return;
          }


          const maxSize =
            5 * 1024 * 1024;


          if (file.size > maxSize) {

            showFormMessage(
              `${file.name} is larger than the 5 MB prototype limit.`,
              "error"
            );

            input.value = "";

            return;
          }


          console.log(
            "Selected file:",
            {
              name: file.name,
              type: file.type,
              size: formatFileSize(file.size),
              lastModified:
                new Date(
                  file.lastModified
                ).toISOString()
            }
          );

        }
      );

    }
  );

}


// ============================================================
// FORM NOTIFICATIONS
// ============================================================

function showFormMessage(
  message: string,
  type: "success" | "error"
): void {

  const messageBox =
    getElement<HTMLDivElement>(
      "#formMessage"
    );


  if (!messageBox) {
    return;
  }


  messageBox.classList.remove(
    "hidden"
  );


  if (type === "success") {

    messageBox.className =
      "rounded-xl p-4 text-sm bg-green-50 border border-green-200 text-green-800";

  } else {

    messageBox.className =
      "rounded-xl p-4 text-sm bg-red-50 border border-red-200 text-red-800";

  }


  messageBox.innerHTML =
    message;

}


// ============================================================
// MOBILE NAVIGATION
// ============================================================

function initializeMobileNavigation(): void {

  const button =
    getElement<HTMLButtonElement>(
      "#mobileMenuButton"
    );

  const menu =
    getElement<HTMLDivElement>(
      "#mobileMenu"
    );


  if (!button || !menu) {
    return;
  }


  button.addEventListener(
    "click",
    () => {

      menu.classList.toggle(
        "hidden"
      );

    }
  );

}


// ============================================================
// APPLICATION BOOTSTRAP
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    initializeMobileNavigation();

    initializeHospitalPage();

    initializeRegistrationPage();

    initializeFileInputs();

  }
);
