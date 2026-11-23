const FORM_ENDPOINT = "https://zzwukucqfumnqlnzrhlf.supabase.co/functions/v1/pre-matricula";

const form = document.getElementById("enrollForm");
const steps = [...document.querySelectorAll(".form-step")];
const dots = [...document.querySelectorAll(".stepdot")];
const progressBar = document.getElementById("progressbar");
const result = document.getElementById("result");
const submitButton = document.getElementById("submitBtn");
const loadedAt = Date.now();
let currentStep = 0;

function showStep(index) {
  currentStep = Math.max(0, Math.min(index, steps.length - 1));
  steps.forEach((step, i) => step.classList.toggle("active", i === currentStep));
  dots.forEach((dot, i) => dot.classList.toggle("active", i <= currentStep));
  progressBar.style.width = `${((currentStep + 1) / steps.length) * 100}%`;
  document.querySelector(".form-shell").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelectorAll(".next").forEach((button) => {
  button.addEventListener("click", () => {
    for (const field of steps[currentStep].querySelectorAll("input, select, textarea")) {
      if (field.willValidate && !field.checkValidity()) {
        field.reportValidity();
        field.focus();
        return;
      }
    }
    showStep(currentStep + 1);
  });
});
document.querySelectorAll(".back").forEach((button) => button.addEventListener("click", () => showStep(currentStep - 1)));

document.getElementById("phone").addEventListener("input", (event) => {
  let digits = event.target.value.replace(/\D/g, "").slice(0, 11);
  if (digits.length > 10) digits = digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  else if (digits.length > 6) digits = digits.replace(/(\d{2})(\d{4})(\d+)/, "($1) $2-$3");
  else if (digits.length > 2) digits = digits.replace(/(\d{2})(\d+)/, "($1) $2");
  event.target.value = digits;
});

function value(id) { return document.getElementById(id).value.trim(); }
function showMessage(message, isError = false) {
  result.classList.toggle("error", isError);
  result.textContent = message;
  result.style.display = "block";
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Form values are sent only to the private Supabase intake function and never
// saved in the browser or published to GitHub.
document.addEventListener("submit", async (event) => {
  if (event.target !== form) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  if (!form.reportValidity()) return;
  const hasHealthDetails = ["support", "allergies"].some((id) => value(id).length > 0);
  const healthConsent = document.getElementById("healthConsent");
  if (hasHealthDetails && !healthConsent.checked) {
    showMessage("Para enviar informações de saúde ou apoio, marque também a autorização específica. Você pode deixar esses campos vazios.", true);
    healthConsent.focus();
    return;
  }

  const websiteTrap = value("website");
  if (websiteTrap) return;

  const gradeNumber = Number.parseInt(value("grade"), 10);
  const periodLabels = { Matutino: "matutino", Vespertino: "vespertino", "Tenho flexibilidade": "flexivel" };
  const payload = {
    childName: value("childName"),
    birthDate: value("birth"),
    grade: gradeNumber,
    school: value("school"),
    schoolShift: value("shift"),
    guardianName: value("guardian"),
    guardianRelation: value("relation"),
    guardianPhone: value("phone"),
    alternatePhone: value("altPhone"),
    guardianEmail: value("email"),
    authorizedPickup: value("pickup"),
    preferredDays: value("days"),
    desiredPeriod: periodLabels[value("period")],
    learningGoals: value("goals"),
    supportNeeds: value("support"),
    allergies: value("allergies"),
    notes: value("notes"),
    guardianConsent: document.getElementById("consent").checked,
    healthDataConsent: healthConsent.checked,
    consentVersion: "2026-11-23-90d-v1",
    website: websiteTrap,
    startedAt: loadedAt,
  };

  submitButton.disabled = true;
  submitButton.textContent = "Enviando com segurança…";
  result.style.display = "none";
  try {
    const response = await fetch(FORM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 429
        ? "Muitas tentativas deste dispositivo. Aguarde 15 minutos ou fale com a Tia Jake pelo WhatsApp."
        : "Não foi possível enviar agora. Seus dados não foram salvos. Tente novamente ou fale com a Tia Jake pelo WhatsApp.";
      showMessage(message, true);
      return;
    }
    form.reset();
    showStep(0);
    showMessage("Pré-matrícula enviada! A Tia Jake recebeu suas informações e entrará em contato para confirmar disponibilidade e próximos passos.");
  } catch {
    showMessage("Não foi possível conectar. Seus dados não foram enviados. Verifique a internet ou fale com a Tia Jake pelo WhatsApp.", true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Enviar pré-matrícula";
  }
}, true);
