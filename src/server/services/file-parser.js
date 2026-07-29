export async function parseDocumentFile({ fileName = "", fileType = "", data = "" }) {
  const buffer = Buffer.from(String(data).replace(/^data:.*?;base64,/, ""), "base64");
  const lowerName = fileName.toLowerCase();
  if (!buffer.length) throw new Error("文件内容为空");

  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") || fileType.startsWith("text/")) {
    return { text: buffer.toString("utf8"), kind: "text" };
  }

  if (lowerName.endsWith(".pdf") || fileType === "application/pdf") {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const parsed = await pdfParse(buffer);
    return { text: parsed.text || "", kind: "pdf" };
  }

  if (lowerName.endsWith(".docx") || fileType.includes("officedocument.wordprocessingml.document")) {
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer });
    return { text: parsed.value || "", kind: "docx" };
  }

  if (lowerName.endsWith(".doc") || fileType === "application/msword") {
    throw new Error("暂不支持旧版 .doc 正文解析，请另存为 .docx 后上传");
  }

  throw new Error("暂不支持该文件格式");
}
