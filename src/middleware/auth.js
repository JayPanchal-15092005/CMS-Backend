import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

// 1. Initialize Firebase Admin safely
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// 2. Employee Auth Middleware
export const requireAuth = () => async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.auth = { userId: decodedToken.uid };
    req.userEmail = decodedToken.email;
    next();
  } catch (error) {
    console.error("Auth Error:", error);
    return res.status(403).json({ error: "Unauthorized: Invalid token" });
  }
};

// 3. Admin Auth Middleware
export const ADMIN_USERS = [
  { email: "jayp93393@gmail.com", password: "JayPanchal15092005" },
  { email: "itsupport@gujaratinfotech.com", password: "itsupport@gujaratinfotech.com" },
  { email: "gujaratinfotech.com", password: "gujaratinfotech.com" },
];

export const adminAuth = (req, res, next) => {
  const email = req.headers["x-admin-email"];
  const password = req.headers["x-admin-password"];

  if (!email || !password) return res.status(401).json({ error: "Missing credentials" });

  const isValidAdmin = ADMIN_USERS.some(
    (admin) => admin.email === email.trim() && admin.password === password
  );

  if (!isValidAdmin) return res.status(403).json({ error: "Unauthorized admin" });
  next();
};