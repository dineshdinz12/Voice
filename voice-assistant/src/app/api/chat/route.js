import { NextResponse } from 'next/server';
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '50mb',
  },
};

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const extractStockSymbols = async (text) => {
  try {
    const extractionPrompt = `

      If the "${text}" is not releated the stocks...Then directly answer with your intelligence...Eg: Input: Hii, Output: Hii, How can I help you? I am voice based stock analysis agent...
      If it is realted to stock and other related to it then:
      Extract stock symbol(s) from this text: "${text}"
      Rules:
      1. Convert company names to stock symbols (e.g., "Apple" → "AAPL", "Microsoft" → "MSFT")
      2. Handle multiple companies if present
      3. Recognize both formal and informal company names
      4. Include market identifier if specified (e.g., "TSLA:NASDAQ")
      
      Return only the symbols without any additional text or formatting:
      - Single stock: Just the symbol (e.g., AAPL)
      - Multiple stocks: Comma-separated symbols (e.g., AAPL,MSFT,GOOGL)
      - No valid companies/symbols found: NULL
    `;

    const response = await generateText({
      model: google('gemini-1.5-pro-latest'),
      messages: [{ role: 'user', content: extractionPrompt }],
      maxSteps: 4,
    });

    if (!response?.text) {
      throw new Error('Empty response from symbol extraction');
    }

    const symbolsStr = response.text.trim().toUpperCase();
    return symbolsStr === 'NULL' ? [] : symbolsStr.split(',').map(s => s.trim());
  } catch (error) {
    console.error('Symbol extraction error:', error);
    throw new Error(`Symbol extraction failed: ${error.message}`);
  }
};

const fetchStockData = async (symbol) => {
  try {
    const queries = [
      {
        type: 'market_data',
        query: `${symbol} stock current price market cap volume PE ratio 52-week high low`,
      },
      {
        type: 'financials',
        query: `${symbol} stock quarterly revenue profit margins earnings growth`,
      },
      {
        type: 'analysis',
        query: `${symbol} stock analyst buy sell ratings price targets next 12 months`,
      },
      {
        type: 'news',
        query: `${symbol} stock breaking news market moves catalysts last 24 hours`,
      }
    ];

    const results = await Promise.all(queries.map(async ({ type, query }) => {
      const response = await fetch(
        `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${process.env.SERP_API_KEY}`
      );

      if (!response.ok) {
        throw new Error(`SERP API request failed for ${type}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        type,
        results: data.organic_results?.slice(0, 3) || []
      };
    }));

    return results.reduce((acc, { type, results }) => {
      acc[type] = results;
      return acc;
    }, {});
  } catch (error) {
    console.error(`Stock data fetch error for ${symbol}:`, error);
    throw new Error(`Failed to fetch stock data: ${error.message}`);
  }
};

const analyzeStockData = async (symbol, stockData, queryContext = '') => {
  try {
    const isComparison = queryContext.toLowerCase().includes('compare') || 
                        queryContext.toLowerCase().includes('versus') ||
                        queryContext.toLowerCase().includes('vs');

    
    const isBuyingSuggestion = queryContext.toLowerCase().includes('should i buy') ||
                              queryContext.toLowerCase().includes('worth buying') ||
                              queryContext.toLowerCase().includes('good investment');

    let analysisPrompt = '';

    if (isComparison) {
      analysisPrompt = `
       I want you to give answers in tabular format with columns based on the user asking counts of companies with bulletin points...It should be in easier format to understand...
       If it is above 3 companies then make them two -two tabular format ...On the whole I want a user-friendly understandable presentation...
        
       Analyze ${symbol} for comparison:
        
        Market Data:
        ${stockData.market_data.map(item => item.snippet).join('\n')}
        
        Financial Metrics:
        ${stockData.financials.map(item => item.snippet).join('\n')}
        
        Provide these specific metrics in a clear format inside that table not in huge para's in points:
        - Current Price
        - Market Cap
        - P/E Ratio
        - Revenue Growth
        - Profit Margin
        - 52-Week Range
        - Volume

        The spacing between each topic and points should be enough so that it should be easy to learn..
        Follow with a brief competitive analysis highlighting key strengths and weaknesses inside that table.
        The output should also contain buying or selling probabilities of the companies out of 100% based on the question asked and data insights at the end...
      `;
    } else if (isBuyingSuggestion) {
      analysisPrompt = `
        Provide a clear investment recommendation for ${symbol} based on:

        Market Position:
        ${stockData.market_data.map(item => item.snippet).join('\n')}

        Financial Health:
        ${stockData.financials.map(item => item.snippet).join('\n')}

        Analyst Views:
        ${stockData.analysis.map(item => item.snippet).join('\n')}

        Recent Developments:
        ${stockData.news.map(item => item.snippet).join('\n')}

        Structure the response as:
        1. Investment Rating: Clear Buy/Hold/Sell recommendation
        2. Target Price Range: Expected price in next 12 months
        3. Key Reasons: 3-4 main factors supporting the recommendation
        4. Risk Factors: Key risks to consider
        5. Timing: Suggested entry points or price levels to watch

        Be direct and actionable, avoiding general disclaimers. Base recommendations purely on available data.
        I want you to answer clearly with buying probability with percentage out of 100% based on the data
        If asked whether to buy or sell which stocks and if choices are more than 2 or 3 then You should provide Buying or selling percentage out of 100% based on the question...

       The spacing between each topic and points should be enough so that it should be easy to learn..
        Eg: Input: Can I buy Testla stock today?
            Output: All the data in structured format response... at last There should be highlightened text like....The buying probability of Testla is 70-80% based on the data...
            Input: Can I buy Amazon or Google stock today?
            Output: All the data in tabular structured format response ...at last There should be highlightened text like....The buying probability of Google based on the insights is 88% and Amazon is 82%...
      `;
    } else {
      analysisPrompt = `
        Analyze ${symbol} stock data:

        Market Position:
        ${stockData.market_data.map(item => item.snippet).join('\n')}

        Financial Performance:
        ${stockData.financials.map(item => item.snippet).join('\n')}

        Expert Analysis:
        ${stockData.analysis.map(item => item.snippet).join('\n')}

        Latest News:
        ${stockData.news.map(item => item.snippet).join('\n')}

        Provide analysis in these sections:
        1. Current Performance
           - Price trends and key levels
           - Trading patterns
           - Relative strength
           
        2. Business Health
           - Revenue and earnings
           - Market share
           - Competitive position
           
        3. Forward Outlook
           - Growth drivers
           - Potential catalysts
           - Risk assessment
           
        4. Action Points
           - Key price levels to watch
           - Potential entry/exit points
           - Specific triggers for position changes

        Keep the response clear and actionable, focusing on data-driven insights.
        The spacing between each topic and points should be enough so that it should be easy to learn..
        Dont use get suggestion from finance releated person or the response is not correct like this at the end....There should be only structured output and finally  give your suggestions or insights or ask questions like willing to buy or sell like that?
      `;
    }

    const response = await generateText({
      model: google('gemini-1.5-pro-latest'),
      messages: [{ role: 'user', content: analysisPrompt }],
      maxSteps: 4,
    });

    if (!response?.text) {
      throw new Error('Empty analysis response');
    }

    return response.text;
  } catch (error) {
    console.error(`Analysis error for ${symbol}:`, error);
    return `Analysis failed for ${symbol}: ${error.message}`;
  }
};

export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');

    if (!audioFile) {
      return NextResponse.json({ 
        success: false, 
        error: 'No audio file provided' 
      }, { status: 400 });
    }

    if (!audioFile.type.startsWith('audio/')) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid file type. Please provide an audio file.' 
      }, { status: 400 });
    }

    // Audio transcription
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const base64Audio = audioBuffer.toString('base64');

    const transcription = await generateText({
      model: google('gemini-1.5-flash-exp-0827'),
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: "Transcribe this audio query about stocks accurately, preserving any comparison or recommendation requests." },
          { type: 'file', data: base64Audio, mimeType: audioFile.type }
        ]
      }]
    });

    if (!transcription?.text) {
      throw new Error('Failed to transcribe audio');
    }

    const symbols = await extractStockSymbols(transcription.text);

    if (symbols.length === 0) {
      return NextResponse.json({
        success: true,
        transcription: transcription.text,
        symbols: [],
        analysis: "I couldn't identify any stock symbols. Please mention specific companies or stocks you'd like to analyze."
      });
    }

    const analysisResults = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const stockData = await fetchStockData(symbol);
          const analysis = await analyzeStockData(symbol, stockData, transcription.text);
          return { symbol, analysis };
        } catch (error) {
          console.error(`Error analyzing ${symbol}:`, error);
          return { 
            symbol, 
            analysis: `Unable to analyze ${symbol}: ${error.message}` 
          };
        }
      })
    );

    const combinedAnalysis = symbols.length > 1
      ? analysisResults.map(({ symbol, analysis }) => `${symbol}:\n${analysis}`).join('\n\n')
      : analysisResults[0].analysis;

    return NextResponse.json({
      success: true,
      transcription: transcription.text,
      symbols: symbols,
      analysis: combinedAnalysis
    });

  } catch (error) {
    console.error('Error in voice stock analysis:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Error processing voice stock analysis',
      details: error.message,
      transcription: error.transcription || null
    }, { 
      status: 500 
    });
  }
}