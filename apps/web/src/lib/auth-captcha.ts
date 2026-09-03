const MAX_CAPTCHA_TOKEN_LENGTH = 4096;

export type AuthCaptchaSubmission =
  | {ok:true; captchaToken?:string}
  | {ok:false; message:string};

export function readAuthCaptchaSubmission(
  formData:FormData,
  configuredSiteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
):AuthCaptchaSubmission {
  const captchaRequired=Boolean(configuredSiteKey?.trim());
  if(!captchaRequired)return {ok:true};

  const rawToken=formData.get("captchaToken");
  const captchaToken=typeof rawToken==="string"?rawToken.trim():"";
  if(!captchaToken||captchaToken.length>MAX_CAPTCHA_TOKEN_LENGTH){
    return {
      ok:false,
      message:"Complete the security verification, then try again.",
    };
  }

  return {ok:true,captchaToken};
}

export function isCaptchaFailure(error:{code?:string}|null|undefined){
  return error?.code==="captcha_failed";
}

export const captchaFailureMessage="Security verification expired or could not be validated. Complete the check again, then retry.";
