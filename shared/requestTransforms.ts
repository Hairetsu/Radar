export type TransformResult = {
  ok: boolean;
  value: string;
  error?: string;
};

function success(value: string): TransformResult {
  return { ok: true, value };
}

function failure(error: string): TransformResult {
  return { ok: false, value: "", error };
}

export function urlEncode(value: string): TransformResult {
  try {
    return success(encodeURIComponent(value));
  } catch {
    return failure("URL encode failed.");
  }
}

export function urlDecode(value: string): TransformResult {
  try {
    return success(decodeURIComponent(value));
  } catch {
    return failure("URL decode failed.");
  }
}

export function jsonFormat(value: string): TransformResult {
  try {
    return success(JSON.stringify(JSON.parse(value), null, 2));
  } catch {
    return failure("JSON format failed.");
  }
}

export function jsonMinify(value: string): TransformResult {
  try {
    return success(JSON.stringify(JSON.parse(value)));
  } catch {
    return failure("JSON minify failed.");
  }
}

export function base64Encode(value: string): TransformResult {
  try {
    return success(btoa(unescape(encodeURIComponent(value))));
  } catch {
    return failure("Base64 encode failed.");
  }
}

export function base64Decode(value: string): TransformResult {
  try {
    return success(decodeURIComponent(escape(atob(value))));
  } catch {
    return failure("Base64 decode failed.");
  }
}

export type JwtDecodeResult = {
  ok: boolean;
  header: string;
  payload: string;
  error?: string;
};

export function jwtDecode(token: string): JwtDecodeResult {
  const parts = token.trim().split(".");
  if (parts.length < 2) {
    return { ok: false, header: "", payload: "", error: "JWT must contain at least header and payload segments." };
  }
  try {
    const decodePart = (part: string) =>
      JSON.stringify(JSON.parse(decodeURIComponent(escape(atob(part.replace(/-/g, "+").replace(/_/g, "/"))))), null, 2);
    return {
      ok: true,
      header: decodePart(parts[0]),
      payload: decodePart(parts[1])
    };
  } catch {
    return { ok: false, header: "", payload: "", error: "JWT decode failed." };
  }
}

export function parseCookieHeader(value: string): TransformResult {
  const cookies = value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      if (index === -1) {
        return { name: part, value: "" };
      }
      return { name: part.slice(0, index).trim(), value: part.slice(index + 1).trim() };
    });

  if (cookies.length === 0) {
    return failure("No cookies found.");
  }

  return success(JSON.stringify(cookies, null, 2));
}
