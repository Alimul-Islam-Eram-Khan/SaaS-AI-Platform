import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import OpenAI from "openai";

import { checkSubscription } from "@/lib/subscription";
import {
  incrementApiLimit,
  checkApiLimit,
} from "@/lib/api-limit";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const instructionMessage = {
  role: "system" as const,
  content:
    "You are a code generator. You must answer only in markdown code snippets. Use code comments for explanations.",
};

export async function POST(req: Request) {
  try {
    // Check authentication
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthorized", {
        status: 401,
      });
    }

    // Check OpenRouter API key
    if (!process.env.OPENROUTER_API_KEY) {
      return new NextResponse(
        "OpenRouter API Key not configured.",
        {
          status: 500,
        }
      );
    }

    // Get request body
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return new NextResponse("Messages are required", {
        status: 400,
      });
    }

    // Check free trial / subscription
    const freeTrial = await checkApiLimit();
    const isPro = await checkSubscription();

    if (!freeTrial && !isPro) {
      return new NextResponse(
        "Free trial has expired. Please upgrade to pro.",
        {
          status: 403,
        }
      );
    }

    // Send request to OpenRouter
    const response = await openrouter.chat.completions.create({
      model: "openrouter/free",
      messages: [
        instructionMessage,
        ...messages,
      ],
    });

    // Increment API usage for free users
    if (!isPro) {
      await incrementApiLimit();
    }

    // Get assistant response
    const message = response.choices[0]?.message;

    if (!message) {
      return new NextResponse(
        "No response received from OpenRouter.",
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(message);

  } catch (error: any) {
    console.error(
      "[CODE_ERROR]",
      error?.response?.data ||
        error?.message ||
        error
    );

    return new NextResponse("Internal Error", {
      status: 500,
    });
  }
}