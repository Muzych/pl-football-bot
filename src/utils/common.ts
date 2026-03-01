export async function fetchJsonOrThrow<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "X-Auth-Token": token },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return (await response.json()) as T;
}
