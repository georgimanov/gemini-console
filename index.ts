import { GoogleGenAI } from "@google/genai";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ai = new GoogleGenAI({});

const chat = ai.chats.create({
  model: "gemini-3.6-flash",
});

const rl = readline.createInterface({ input: stdin, output: stdout });

console.log("Gemini console dojo — type a message, or /quit to exit.\n");

rl.setPrompt("you> ");
rl.prompt();

for await (const message of rl) {
  if (message.trim() === "/quit") {
    break;
  }
  if (message.trim() === "") {
    rl.prompt();
    continue;
  }

  const stream = await chat.sendMessageStream({ message });

  stdout.write("gemini> ");
  for await (const chunk of stream) {
    stdout.write(chunk.text ?? "");
  }
  stdout.write("\n\n");

  rl.prompt();
}

rl.close();
