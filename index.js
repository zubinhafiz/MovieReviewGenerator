const axios = require("axios");
const fs = require("fs");
const { OpenAI } = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const writeDataToFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const readDataFromFile = (filePath) => {
  const rawData = fs.readFileSync(filePath);
  return JSON.parse(rawData);
};

const processMovies = async (data) => {
  const reviews = [];

  let i = 1;
  for (const movie of data) {
    console.log(`Generating for movie ${i}`);
    const review = await generateReview(movie);
    if (review.text) {
      reviews.push({
        text: review.text,
        generation_cost: review.cost,
        is_human: 0,
      });
    }
    i++;
  }

  i = 1;
  for (const review of reviews) {
    console.log(`Testing for review ${i}`);
    const percentages = await testReview(review.text);
    review.is_human = percentages; // Adjusted to handle multiple outputs
    i++;
  }

  return reviews;
};

const generateReview = async (movie) => {
  try {
    const plot = movie["Plot"];
    const prompt = `Based on the poster and this synopsis:\n\n${plot}\n\nImagine, you are a renowned movie critic, whose fame has been sealed to the wall as one of the best movie reviewers of all time. You are known to encapsulate all the emotions in the movie on the text and use subtle humor or seriousness based on the tone of the film, such that only those paying attention would understand cloaked in references in your style of writing. You need to write a review on the movie and in the end give a rating out of 5. Take a deep breath before you start. Best of luck!`;

    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt },
      ],
      model: "gpt-4-turbo",
    });

    return {
      text: completion.choices[0].message.content,
      cost: completion.usage.total_tokens,
    };
  } catch (err) {
    console.log(err.message);
  }
};

const testReview = async (review) => {
  const zeroGPTUrl = "https://api.zerogpt.com/api/detect/detectText";
  const gptZeroUrl = "https://api.gptzero.me/v2/predict/text";
  const headersZeroGPT = {
    "Content-Type": "application/json",
    "x-api-key": process.env.ZEROGPT_API_KEY,
  };
  const headersGPTZero = {
    "Content-Type": "application/json",
    "x-api-key": process.env.GPTZERO_API_KEY,
  };
  const bodyZeroGPT = {
    input_text: review,  // Correct for ZeroGPT
  };
  const bodyGPTZero = {
    document: review,  // Correct for GPTZero
    version: "2024-01-09",  // Using a specific version as per the GPTZero API documentation
    multilingual: false  // This is optional and can be set based on your needs
  };

  try {
    const [zeroGPTResponse, gptZeroResponse] = await Promise.all([
      axios.post(zeroGPTUrl, bodyZeroGPT, { headers: headersZeroGPT }),
      axios.post(gptZeroUrl, bodyGPTZero, { headers: headersGPTZero })
    ]);

    // Calculate and cap the percentage values
    const humanProberoGPT = zeroGPTResponse.data.data ? Math.min(Math.round(zeroGPTResponse.data.data.isHuman * 100), 100) : 0;
    const humanProbGPTZero = gptZeroResponse.data.documents[0] ? Math.min(Math.round(gptZeroResponse.data.documents[0].class_probabilities.human * 100), 100) : 0;


    return {
      ZeroGPT: `${humanProberoGPT * 100}% human-like content`,
      GPTZero: `${humanProbGPTZero * 100}% human-like content`
    };
  } catch (err) {
    console.error("Error in testReview:", err);
    return { GPTZero: "Error", ZeroGPT: "Error" };  // Provide fallback error messages
  }
};

const main = async () => {
  const moviesData = readDataFromFile("data.json");
  const processedData = await processMovies(moviesData);
  writeDataToFile("reviews.json", processedData);
};

main().catch((err) => console.error("Error in processing:", err));
