"use client";

/**
 * VK ID Login Button — redirect с PKCE.
 * code_verifier сохраняется в cookie (читается сервером).
 */
export function VKIDButton() {
  async function handleVKLogin() {
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Сохраняем code_verifier в cookie для сервера
    document.cookie = `vk_code_verifier=${codeVerifier}; path=/; max-age=900; SameSite=Lax; Secure`;

    const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
    const redirectUri = encodeURIComponent(`${siteUrl}/callback/vk`);
    const clientId = process.env.NEXT_PUBLIC_VK_CLIENT_ID ?? "54529300";
    window.location.href = `https://id.vk.com/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=email&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  }

  return (
    <button
      type="button"
      onClick={handleVKLogin}
      className="soft-social-button flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition-colors"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.02-1.304.587-1.496c.598-.189 1.365 1.26 2.179 1.817.616.42 1.084.328 1.084.328l2.175-.03s1.138-.07.599-.964c-.044-.073-.314-.661-1.618-1.869-1.366-1.265-1.183-1.06.462-3.246.999-1.33 1.398-2.142 1.273-2.49-.12-.331-.853-.244-.853-.244l-2.445.015s-.182-.025-.315.056c-.131.079-.216.264-.216.264s-.388 1.032-.905 1.91c-1.09 1.852-1.526 1.95-1.704 1.835-.414-.267-.31-1.075-.31-1.649 0-1.792.271-2.539-.529-2.732-.266-.064-.461-.106-1.14-.113-.87-.009-1.606.003-2.023.207-.278.137-.492.44-.362.457.161.022.526.099.719.364.249.342.24 1.11.24 1.11s.143 2.11-.334 2.372c-.327.18-.776-.187-1.739-1.865-.493-.859-.865-1.81-.865-1.81s-.072-.176-.2-.271c-.155-.115-.372-.151-.372-.151l-2.324.015s-.35.01-.478.162c-.114.135-.009.414-.009.414s1.817 4.244 3.875 6.384c1.886 1.963 4.032 1.834 4.032 1.834h.972z" fill="currentColor" />
      </svg>
      ВКонтакте
    </button>
  );
}

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, length);
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
