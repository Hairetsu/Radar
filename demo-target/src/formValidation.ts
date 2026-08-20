export type ValidationResult =
  | Readonly<{ kind: "valid" }>
  | Readonly<{ kind: "invalid"; message: string }>;

const AVAILABLE_INVOICES = new Set(["INV-1007"]);
const SHARED_DOCUMENTS = new Set(["quarterly/manifest.txt", "briefs/port-notice.txt"]);

function valid(): ValidationResult {
  return { kind: "valid" };
}

function invalid(message: string): ValidationResult {
  return { kind: "invalid", message };
}

export function validateLogin(input: Readonly<{ username: string; password: string }>): ValidationResult {
  if (!/^[a-z][a-z0-9.-]{2,31}$/.test(input.username)) {
    return invalid("Enter a valid Harborline operator ID.");
  }
  if (input.password.length < 8 || input.password.length > 72) {
    return invalid("Password must contain 8 to 72 characters.");
  }
  return valid();
}

export function validateShipmentQuery(query: string): ValidationResult {
  const normalized = query.trim();
  if (normalized.length < 2 || normalized.length > 60) {
    return invalid("Enter 2 to 60 characters.");
  }
  if (!/^[a-zA-Z0-9 .,&-]+$/.test(normalized)) {
    return invalid("Use letters, numbers, spaces, periods, commas, ampersands, or hyphens.");
  }
  return valid();
}

export function validateInvoiceId(invoiceId: string): ValidationResult {
  if (!/^INV-\d{4}$/.test(invoiceId)) {
    return invalid("Use an invoice number such as INV-1007.");
  }
  if (!AVAILABLE_INVOICES.has(invoiceId)) {
    return invalid("That invoice is not assigned to your account.");
  }
  return valid();
}

export function validateDocumentPath(path: string): ValidationResult {
  if (!SHARED_DOCUMENTS.has(path)) {
    return invalid("Choose a document shared with terminal NAT-04.");
  }
  return valid();
}

export function validateFeedUrl(rawUrl: string): ValidationResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return invalid("Enter a complete partner feed URL.");
  }

  if (url.protocol !== "https:" || url.hostname !== "status.example.test" || url.pathname !== "/feed") {
    return invalid("Use the approved North Atlantic status feed.");
  }
  return valid();
}

export function validateSupportMessage(message: string): ValidationResult {
  const normalized = message.trim();
  if (normalized.length < 10 || normalized.length > 500) {
    return invalid("Enter a customer update between 10 and 500 characters.");
  }
  if (/[<>]/.test(normalized)) {
    return invalid("The customer update contains unsupported characters.");
  }
  return valid();
}

export function validateProfile(input: Readonly<{ displayName: string; jobTitle: string }>): ValidationResult {
  if (!/^[a-zA-Z .'-]{2,60}$/.test(input.displayName.trim())) {
    return invalid("Enter a valid display name.");
  }
  if (!/^[a-zA-Z0-9 &.,'-]{2,80}$/.test(input.jobTitle.trim())) {
    return invalid("Enter a valid job title.");
  }
  return valid();
}
