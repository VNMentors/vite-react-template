import { Hono } from "hono";
import type { AppEnv } from "./types";
import auth from "./routes/auth";
import customers from "./routes/customers";
import products from "./routes/products";
import stats from "./routes/stats";
import reports from "./routes/reports";
import users from "./routes/users";
import importRoute from "./routes/import";
import publicRoute from "./routes/public";
import groupsRoute from "./routes/groups";
import subscriptionsRoute from "./routes/subscriptions";
import lmsRoute from "./routes/lms";

const app = new Hono<AppEnv>();

app.route("/api/auth", auth);
app.route("/api/customers", customers);
app.route("/api/products", products);
app.route("/api/stats", stats);
app.route("/api/reports", reports);
app.route("/api/users", users);
app.route("/api/import", importRoute);
app.route("/api/public", publicRoute);
app.route("/api/groups", groupsRoute);
app.route("/api", subscriptionsRoute);
app.route("/api/lms", lmsRoute);

export default app;
