const isProduction = process.env.NODE_ENV === "production";

const accessOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
};

const refreshOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/api/v1/auth/refresh",
};

export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie("access_token", accessToken, {
    ...accessOptions,
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refresh_token", refreshToken, {
    ...refreshOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie("access_token", accessOptions);
  res.clearCookie("refresh_token", refreshOptions);
}
