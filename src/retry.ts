export async function retry<T>(
  operation: (args: { attempt: number; maxAttempts: number }) => Promise<T>,
  maxAttempts = 3,
  delay = 1000,
): Promise<T> {
  let attempt = 0

  while (true) {
    try {
      return await operation({ attempt, maxAttempts })
    } catch (error) {
      attempt++

      if (attempt >= maxAttempts) {
        throw error
      }

      const currentDelay = delay * Math.pow(2, attempt - 1)
      await new Promise((r) => setTimeout(r, currentDelay))
    }
  }
}
