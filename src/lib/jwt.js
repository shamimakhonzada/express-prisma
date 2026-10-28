import jwt from "jsonwebtoken";

export function generateAccessToken({ id, email, sessionId }) {
  return jwt.sign(
    {
      sub: id,
      email,
      sid: sessionId,
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: "15m",
      algorithm: "HS256",
    },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
  });
}
