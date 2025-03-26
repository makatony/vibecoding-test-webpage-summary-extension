document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyButton = document.getElementById('saveApiKey');
  const summarizeButton = document.getElementById('summarizeButton');
  const closeButton = document.getElementById('closeButton');
  const clearButton = document.getElementById('clearButton');
  const loadingElement = document.getElementById('loading');
  const summaryElement = document.getElementById('summary');
  
  // Verify marked.js is available
  if (typeof marked === 'undefined') {
    console.error('Marked library not loaded!');
    summaryElement.innerHTML = '<p class="error">Error: Markdown library not loaded. Please reload the extension.</p>';
  } else {
    console.log('Marked.js loaded successfully!');
    
    // Configure marked.js
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false
    });
  }
  
  // Load saved API key and previous summary when popup opens
  chrome.storage.local.get(['openai_api_key', 'last_summary_markdown'], function(result) {
    if (result.openai_api_key) {
      apiKeyInput.value = result.openai_api_key;
    }
    
    // Restore previous summary if available
    if (result.last_summary_markdown) {
      renderMarkdown(result.last_summary_markdown);
    }
  });
  
  // Helper function to render markdown
  function renderMarkdown(markdown) {
    try {
      if (typeof marked === 'undefined') {
        console.error('Marked library not available');
        summaryElement.textContent = markdown;
        return;
      }
      
      // Process markdown before rendering
      const processedMarkdown = markdown
        .replace(/⚠️/g, '⚠️ ')  // Add space after warning emoji for better display
        .replace(/(\n\s*\n)/g, '\n\n');  // Normalize line breaks
      
      // Convert markdown to HTML
      const html = marked.parse(processedMarkdown);
      
      // Apply the HTML to the summary element
      summaryElement.innerHTML = html;
      
      // Log for debugging
      console.log('Raw markdown:', markdown);
      console.log('HTML output:', summaryElement.innerHTML);
    } catch (error) {
      console.error('Error rendering markdown:', error);
      summaryElement.textContent = markdown;
    }
  }
  
  // Save API key
  saveApiKeyButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.local.set({ 'openai_api_key': apiKey }, function() {
        alert('API key saved!');
      });
    } else {
      alert('Please enter a valid API key');
    }
  });
  
  // Close button handler
  closeButton.addEventListener('click', function() {
    window.close();
  });
  
  // Clear button handler
  clearButton.addEventListener('click', function() {
    summaryElement.innerHTML = '';
    chrome.storage.local.remove('last_summary_markdown');
  });
  
  // Helper function to count words
  function countWords(text) {
    return text.trim().split(/\s+/).length;
  }
  
  // Helper function to estimate tokens
  function estimateTokens(text) {
    // OpenAI's tokenization is complex, but roughly 1 token ≈ 4 characters or 0.75 words
    const characterEstimate = Math.ceil(text.length / 4);
    const wordEstimate = Math.ceil(countWords(text) * 0.75);
    
    // Return average of both estimates for better approximation
    return Math.ceil((characterEstimate + wordEstimate) / 2);
  }
  
  // Summarize button handler
  summarizeButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      summaryElement.innerHTML = '<p class="error">Please enter your OpenAI API key first</p>';
      return;
    }
    
    loadingElement.style.display = 'block';
    summaryElement.textContent = '';
    
    // Get the current tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const activeTab = tabs[0];
      
      // Get page content from content script
      chrome.tabs.sendMessage(activeTab.id, {action: "getContent"}, function(response) {
        if (chrome.runtime.lastError) {
          loadingElement.style.display = 'none';
          const errorMessage = '<p class="error">Error: Could not connect to page. Try reloading.</p>';
          summaryElement.innerHTML = errorMessage;
          return;
        }
        
        if (response) {
          // Call OpenAI API for summarization
          summarizeWithGPT(response, apiKey);
        }
      });
    });
  });
  
  // Function to call OpenAI API
  async function summarizeWithGPT(pageData, apiKey) {
    try {
      let prompt;
      
      if (pageData.isYouTube) {
        prompt = `Please summarize this YouTube video using the following steps:

1. Write a 1-sentence summary of the overall topic or purpose of the video.
2. Extract 3–5 key insights, tips, or arguments made in the video. Write them as bullet points.
3. If the video includes a strong opinion, call to action, controversy, or critical example, include it in a ⚠️ "Key Moment or Takeaway" section.
4. Use clear headings and keep the summary short but highly informative.

Title: "${pageData.title}"

Transcript:
${pageData.content}`;
      } else {
        prompt = `Please summarize the following web page using the following approach:

1. Identify the main topic of the page and express it in one short sentence.
2. Extract the 2–4 most important insights, facts, or claims. Write them as bullet points.
3. If the page contains an important warning, callout, or example, summarize it in a "⚠️ Key Warning or Example" section.
4. Use bold headings to make the structure easy to scan. 

Title: "${pageData.title}"

Content:
${pageData.content.substring(0, 8000)}`;
      }
      
      // Log word count and estimated token count
      const wordCount = countWords(prompt);
      const estimatedTokens = estimateTokens(prompt);
      console.log(`Sending to OpenAI API:
- Words: ${wordCount}
- Estimated tokens: ${estimatedTokens}
- Characters: ${prompt.length}`);
      
      // Add stats to the UI
      const statsDiv = document.createElement('div');
      statsDiv.innerHTML = `<p style="font-size: 12px; color: #666;">Sending to API: ${wordCount} words / ~${estimatedTokens} estimated tokens</p>`;
      summaryElement.appendChild(statsDiv);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system", 
              content: "You are an expert summarizer and technical writer. Your goal is to extract the most important information from a web page and present it in a structured, readable, and insightful way. You write like an analyst who wants to help others quickly understand the key takeaways. Use markdown formatting: ## for headings, **bold** for emphasis, and bullet points (- ) for lists. Highlight any important warnings or implications when applicable. Be precise, avoid fluff, and focus on what's new, surprising, or actionable."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 500
        })
      });
      
      const data = await response.json();
      
      // Log API response for debugging
      console.log('OpenAI API response received');
      
      // If the API returns token usage info, log it for comparison with our estimate
      if (data.usage) {
        console.log(`Actual token usage from OpenAI:
- Prompt tokens: ${data.usage.prompt_tokens}
- Completion tokens: ${data.usage.completion_tokens}
- Total tokens: ${data.usage.total_tokens}`);
        
        console.log(`Estimation accuracy: ${Math.round((estimatedTokens / data.usage.prompt_tokens) * 100)}%`);
      }
      
      loadingElement.style.display = 'none';
      
      if (data.error) {
        const errorMessage = `<p class="error">Error: ${data.error.message}</p>`;
        summaryElement.innerHTML = errorMessage;
      } else if (data.choices && data.choices[0]) {
        const markdownContent = data.choices[0].message.content;
        console.log('Received markdown from API:', markdownContent);
        
        // Save the markdown content to storage
        chrome.storage.local.set({ 'last_summary_markdown': markdownContent }, function() {
          console.log('Markdown saved to storage');
        });
        
        // Render the markdown to HTML
        renderMarkdown(markdownContent);
      } else {
        const errorMessage = '<p class="error">Error: Unexpected API response</p>';
        summaryElement.innerHTML = errorMessage;
      }
      
    } catch (error) {
      loadingElement.style.display = 'none';
      const errorMessage = `<p class="error">Error: ${error.message}</p>`;
      summaryElement.innerHTML = errorMessage;
      console.error('Error in summarization:', error);
    }
  }
});