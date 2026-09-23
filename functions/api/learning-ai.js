function extractContent(response) {
  if (!response) return null;

  try {

    // string
    if (typeof response === "string") {
      return response;
    }

    // Workers AI รุ่นที่คืน response ตรงๆ
    if (
      response.response &&
      typeof response.response === "string"
    ) {
      return response.response;
    }

    // result.response
    if (
      response.result &&
      typeof response.result.response === "string"
    ) {
      return response.result.response;
    }

    // output_text
    if (
      response.output_text &&
      typeof response.output_text === "string"
    ) {
      return response.output_text;
    }

    // content string
    if (
      response.content &&
      typeof response.content === "string"
    ) {
      return response.content;
    }

    // content array
    if (Array.isArray(response.content)) {

      const text = response.content
        .map(item => {

          if (typeof item === "string") {
            return item;
          }

          if (
            item &&
            typeof item.text === "string"
          ) {
            return item.text;
          }

          if (
            item &&
            typeof item.content === "string"
          ) {
            return item.content;
          }

          return "";
        })
        .join("\n")
        .trim();

      if (text) {
        return text;
      }
    }

    // OpenAI style
    if (
      response.choices &&
      response.choices[0] &&
      response.choices[0].message
    ) {

      const msg =
        response.choices[0].message;

      if (
        typeof msg.content === "string"
      ) {
        return msg.content;
      }

      if (
        Array.isArray(msg.content)
      ) {

        const text = msg.content
          .map(part => {

            if (
              typeof part === "string"
            ) {
              return part;
            }

            if (
              part &&
              typeof part.text === "string"
            ) {
              return part.text;
            }

            return "";
          })
          .join("\n")
          .trim();

        if (text) {
          return text;
        }
      }
    }

    // reasoning_content fallback
    if (
      response.choices?.[0]?.message?.reasoning_content
    ) {

      return JSON.stringify({
        summary:
          "AI returned reasoning only",
        observed_signals: [],
        learning: {
          what_we_learned:
            "Model did not return final structured content",
          confidence: "LOW"
        },
        problems: [
          "Missing final JSON output"
        ],
        next_content: {
          action: "WAIT",
          direction:
            "Check AI response format",
          angle: "",
          cta: "",
          success_metric: ""
        },
        next_action: {
          type: "WAIT",
          reason:
            "Model returned reasoning only"
        },
        priority: "LOW"
      });
    }

    return null;

  } catch (error) {

    console.error(
      "extractContent error",
      error
    );

    return null;
  }
}
