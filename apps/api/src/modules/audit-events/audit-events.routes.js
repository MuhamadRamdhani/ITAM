import ExcelJS from "exceljs";
import { listAuditEventsService, exportAuditEventsService } from "./audit-events.service.js";

function extractActorEmail(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const p = payload;
  const email =
    p.email ??
    p.actor_email ??
    p.user_email ??
    p.identity_email ??
    p.identityEmail ??
    p.userEmail ??
    null;

  return String(email || "").trim();
}

function getDbFromFastify(fastify) {
  return fastify.db ?? fastify.pg ?? fastify.dbPool ?? null;
}

function sendError(reply, err) {
  const statusCode = err?.statusCode || 500;
  const code = err?.code || "INTERNAL_SERVER_ERROR";

  reply.code(statusCode).send({
    ok: false,
    error: {
      code,
      message: err?.message || "Internal server error",
      details: err?.details,
    },
  });
}

export default async function auditEventsRoutes(fastify) {
  const db = getDbFromFastify(fastify);

  if (!db || typeof db.query !== "function") {
    throw new Error("Database handle not found on fastify instance");
  }

  fastify.get("/export", async function handler(request, reply) {
    try {
      const format = String(request?.query?.format ?? "json").trim().toLowerCase();
      if (format !== "json" && format !== "xlsx" && format !== "excel") {
        const e = new Error("Unsupported format");
        e.statusCode = 400;
        e.code = "BAD_REQUEST";
        e.details = { allowed: ["json", "xlsx"] };
        throw e;
      }

      const data = await exportAuditEventsService(db, request, request.query);

      if (format === "json") {
        reply.header("Content-Disposition", 'attachment; filename="audit-events.json"');
        reply.type("application/json");
        reply.send({ ok: true, data });
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "ITAM";
      workbook.created = new Date();
      workbook.modified = new Date();
      workbook.properties.date1904 = false;

      const sheet = workbook.addWorksheet("Audit Events", {
        views: [{ state: "frozen", ySplit: 1 }],
      });

      sheet.columns = [
        { header: "Time", key: "created_at", width: 24 },
        { header: "Actor", key: "actor", width: 28 },
        { header: "Actor Email", key: "actor_email", width: 28 },
        { header: "Event", key: "action", width: 28 },
        { header: "Object Type", key: "entity_type", width: 20 },
        { header: "Object ID", key: "entity_id", width: 12 },
        { header: "Payload", key: "payload", width: 80 },
      ];

      for (const row of data.items || []) {
        const actorEmail = extractActorEmail(row.payload);
        const actorDisplay = actorEmail ? `${row.actor ?? ""} (${actorEmail})` : (row.actor ?? "");
        sheet.addRow({
          created_at: row.created_at ?? "",
          actor: actorDisplay,
          actor_email: actorEmail,
          action: row.action ?? "",
          entity_type: row.entity_type ?? "",
          entity_id: row.entity_id ?? "",
          payload:
            row.payload == null || row.payload === ""
              ? ""
              : JSON.stringify(row.payload, null, 2),
        });
      }

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FF0F172A" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0F2FE" },
      };
      headerRow.alignment = { vertical: "middle" };
      headerRow.height = 22;

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.alignment = { vertical: "top", wrapText: true };
        }
      });

      sheet.autoFilter = {
        from: "A1",
        to: "F1",
      };

      const buffer = await workbook.xlsx.writeBuffer();
      reply.header("Content-Disposition", 'attachment; filename="audit-events.xlsx"');
      reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.send(Buffer.from(buffer));
    } catch (err) {
      sendError(reply, err);
    }
  });

  fastify.get("/", async function handler(request, reply) {
    try {
      const data = await listAuditEventsService(db, request, request.query);
      reply.send({ ok: true, data });
    } catch (err) {
      sendError(reply, err);
    }
  });
}
