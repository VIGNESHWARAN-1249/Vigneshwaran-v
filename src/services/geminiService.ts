import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const findNearbyHospitals = async (lat: number, lng: number) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `I am in an emergency situation at latitude ${lat} and longitude ${lng}. Please identify the 3 nearest hospitals or emergency medical centers. For each, provide their name and their official phone number. I need to request an ambulance.`,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: lat,
              longitude: lng,
            },
          },
        },
      },
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const hospitalLinks = chunks
      .filter((chunk: any) => chunk.maps?.uri)
      .map((chunk: any) => ({
        title: chunk.maps.title,
        uri: chunk.maps.uri,
        phone: chunk.maps.phone || "N/A" // Some might not have phone in metadata, but Gemini text will likely have it
      }));

    return {
      text: response.text || "No hospital information found.",
      links: hospitalLinks,
    };
  } catch (error) {
    console.error("Error finding hospitals:", error);
    return { text: "Could not retrieve hospital information due to an error.", links: [] };
  }
};
