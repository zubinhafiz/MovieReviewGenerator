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
    const percentage = await testReview(review.text);
    review.is_human = percentage;
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
  const url = "https://api.zerogpt.com/api/detect/detectText";
  const headers = {
    "Content-Type": "application/json",
    ApiKey: process.env.GPTZERO_API_KEY,
  };
  const body = {
    input_text: review,
  };

  try {
    const response = await axios.post(url, body, { headers });
    return response.data.data.isHuman;
  } catch (err) {
    console.log(err);
  }
};

const main = async () => {
  const moviesData = readDataFromFile("data.json");
  const processedData = await processMovies(moviesData);
  writeDataToFile("reviews.json", processedData);
};

main().catch((err) => console.error("Error in processing:", err));
