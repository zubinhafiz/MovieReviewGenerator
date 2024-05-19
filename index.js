const axios = require("axios");
const fs = require("fs");
const { OpenAI } = require("openai");
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
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

  for (const movie of data) {
    console.log(`Generating for movie ${movie.Title}`); // Log using the movie title
    const review = await generateReview(movie);
    if (review.text) {
      reviews.push({
        text: review.text,
        generation_cost: review.cost,
        title: movie.Title, // Correct key for Title
        releaseYear: movie["Release Year"], // Correct key for Release Year
        is_human: await testReview(review.text) // Assume this returns the object with GPTZero and ZeroGPT percentages
      });
    }
  }
  // console.log(reviews)
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
    ApiKey: process.env.ZEROGPT_API_KEY,
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
    const humanProbZeroGPT = zeroGPTResponse.data.data ? Math.min(Math.round(zeroGPTResponse.data.data.isHuman * 100), 100) : 0;
    const humanProbGPTZero = gptZeroResponse.data.documents[0] ? Math.min(Math.round(gptZeroResponse.data.documents[0].class_probabilities.human * 100), 100) : 0;


    return {
      ZeroGPT: `${humanProbZeroGPT}% human-like content`,
      GPTZero: `${humanProbGPTZero}% human-like content`
    };
  } catch (err) {
    console.error("Error in testReview:", err.message);
    console.log(`Failed API call with error: ${err.response ? err.response.data : 'No response data'}`);
    return { GPTZero: "Error", ZeroGPT: "Error" };  // Provide fallback error messages
  }
  
};

const main = async () => {
  const moviesData = readDataFromFile("data.json");
  const processedData = await processMovies(moviesData);

  const csvWriter = createCsvWriter({
    path: 'reviews.csv',
    header: [
      {id: 'title', title: 'TITLE'},
      {id: 'releaseYear', title: 'RELEASE YEAR'},
      {id: 'humanLikeGPTZero', title: 'GPTZero Human-like (%)'},
      {id: 'humanLikeZeroGPT', title: 'ZeroGPT Human-like (%)'}
    ]
  });

  const records = processedData.map(review => ({
    title: review.title,
    releaseYear: review.releaseYear,
    humanLikeGPTZero: review.is_human.GPTZero.replace('% human-like content', ''),
    humanLikeZeroGPT: review.is_human.ZeroGPT.replace('% human-like content', '')
  }));

  csvWriter.writeRecords(records)
    .then(() => {
      console.log('The CSV file was written successfully');
    });
};
main().catch((err) => console.error("Error in processing:", err));
