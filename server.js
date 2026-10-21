const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());


// -------------------------
// OPENAI
// -------------------------

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


// -------------------------
// SUPABASE
// -------------------------

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);


// -------------------------
// AUTHENTICATION
// -------------------------

async function requireUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        error: "You must sign in."
      });
    }

    const token = authHeader.substring(7);

    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: "Your login has expired. Please sign in again."
      });
    }

    req.user = user;

    next();

  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(401).json({
      error: "Authentication failed."
    });
  }
}


// -------------------------
// GET CURRENT USER PROFILE
// -------------------------

app.get(
  "/profile",
  requireUser,
  async (req, res) => {

    try {

      const { data: profile, error } =
        await supabase
          .from("profiles")
          .select(
            "plan, questions_used, question_limit, subscription_status"
          )
          .eq("id", req.user.id)
          .single();

      if (error || !profile) {
        console.error(error);

        return res.status(404).json({
          error: "Profile not found."
        });
      }

      res.json({
        plan: profile.plan,
        questionsUsed: profile.questions_used,
        questionLimit: profile.question_limit,
        subscriptionStatus:
          profile.subscription_status
      });

    } catch (error) {

      console.error("Profile error:", error);

      res.status(500).json({
        error: "Unable to load profile."
      });
    }
  }
);


// -------------------------
// AI ANSWER ROUTE
// -------------------------

app.post(
  "/answer",
  requireUser,
  async (req, res) => {

    try {

      const { question, choices = [] } = req.body;

      if (!question) {
        return res.status(400).json({
          error: "Question is required."
        });
      }


      // -------------------------
      // GET USER PROFILE
      // -------------------------

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select(
            "plan, questions_used, question_limit, subscription_status"
          )
          .eq("id", req.user.id)
          .single();

      if (profileError || !profile) {

        console.error(profileError);

        return res.status(404).json({
          error: "Profile not found."
        });
      }


      // -------------------------
      // CHECK USAGE LIMIT
      // -------------------------

      if (
        profile.questions_used >=
        profile.question_limit
      ) {

        return res.status(403).json({
          error: "FREE_LIMIT_REACHED",
          message:
            "You've reached your question limit.",
          questionsUsed:
            profile.questions_used,
          questionLimit:
            profile.question_limit
        });
      }


      // -------------------------
      // FORMAT ANSWER CHOICES
      // -------------------------

      const formattedChoices =
        choices.length > 0
          ? choices
              .map(
                (choice, index) =>
                  `${String.fromCharCode(
                    65 + index
                  )}. ${choice}`
              )
              .join("\n")
          : "";


      // -------------------------
      // ASK OPENAI
      // -------------------------

      const response =
        await openai.responses.create({

          model: "gpt-5-mini",

          instructions: `
You are a study assistant for practice questions and authorized assessments.

Analyze the multiple-choice question carefully.

Return ONLY valid JSON in exactly this format:

{
  "answer": "B",
  "answerText": "Example answer",
  "explanation": "Short explanation of why this answer is correct."
}

Do not include markdown.
Do not include text before or after the JSON.

If the answer choices are included inside the question text,
identify them and determine the correct answer letter.
`,

          input: `
QUESTION:
${question}

CHOICES:
${formattedChoices}
`
        });


      // -------------------------
      // PARSE AI RESPONSE
      // -------------------------

      let text =
        response.output_text.trim();

      text = text
        .replace(/^```json/i, "")
        .replace(/^```/i, "")
        .replace(/```$/i, "")
        .trim();

      const result = JSON.parse(text);


      // -------------------------
      // INCREMENT REAL USAGE
      // -------------------------

      const newUsage =
        profile.questions_used + 1;

      const {
        data: updatedProfile,
        error: updateError
      } =
        await supabase
          .from("profiles")
          .update({
            questions_used: newUsage
          })
          .eq("id", req.user.id)
          .select(
            "questions_used, question_limit"
          )
          .single();

      if (updateError) {

        console.error(
          "Usage update error:",
          updateError
        );

        return res.status(500).json({
          error:
            "Answer generated but usage tracking failed."
        });
      }


      // -------------------------
      // RETURN ANSWER
      // -------------------------

      res.json({
        answer: result.answer,
        answerText: result.answerText,
        explanation: result.explanation,

        questionsUsed:
          updatedProfile.questions_used,

        questionLimit:
          updatedProfile.question_limit
      });

    } catch (error) {

      console.error("Answer error:", error);

      res.status(500).json({
        error: "AI request failed."
      });
    }
  }
);


// -------------------------
// START SERVER
// -------------------------

app.listen(3000, () => {
  console.log(
    "AI Quiz Server running on http://localhost:3000"
  );
});