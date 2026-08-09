import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { login, logout, me, requireSession } from "./auth";
import sessionRoutes from "./routes/sessions";
import roomRoutes from "./routes/rooms";
import peopleRoutes from "./routes/people";
import enrolmentRoutes from "./routes/enrolments";
import { startScheduler } from "./scheduler";
import assistantRoutes from "./routes/assistant";
import passwordResetRoutes from "./routes/passwordReset";
const app = express();

app.use(
  cors({
    origin: process.env.WEB_BASE_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.use("/api/enrolments", enrolmentRoutes);

app.post("/api/login", login);
app.post("/api/logout", logout);
app.get("/api/me", requireSession, me);

app.use("/api/sessions", sessionRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/people", peopleRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/auth", passwordResetRoutes);
const port = Number(process.env.API_PORT) || 4000;

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
startScheduler();
