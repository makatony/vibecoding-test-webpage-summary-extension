// Function to extract content from the page
async function extractPageContent() {
  if (isYouTube()) {
    return await extractYouTubeData();
  } else {
    return {
      isYouTube: false,
      title: document.title,
      content: document.body.innerText
    };
  }
}

// Check if current page is YouTube
function isYouTube() {
  return window.location.hostname.includes('youtube.com') && 
         window.location.pathname.includes('/watch');
}

// Extract YouTube title and transcript
async function extractYouTubeData() {
  const title = document.querySelector('h1.ytd-watch-metadata')?.textContent || document.title;
  
  // Get transcript
  let transcript = "";
  
  // Try to find transcript in YouTube's UI
  const transcriptElements = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer'));
  
  if (transcriptElements.length > 0) {
    // If transcript is already open, get content
    transcript = transcriptElements.map(el => {
      const text = el.querySelector('#content-text')?.textContent || '';
      return text;
    }).join(' ');
  } else {
    // Try to open transcript
    const moreActionsButton = document.querySelector('button[aria-label="More actions"]');
    if (moreActionsButton) {
      moreActionsButton.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Find and click "Show transcript" option
      const menuItems = Array.from(document.querySelectorAll('tp-yt-paper-item'));
      const transcriptButton = menuItems.find(item => 
        item.textContent.includes('Show transcript')
      );
      
      if (transcriptButton) {
        transcriptButton.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Now try to get transcript content
        const transcriptSegments = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer'));
        transcript = transcriptSegments.map(el => {
          const text = el.querySelector('#content-text')?.textContent || '';
          return text;
        }).join(' ');
      }
    }
  }

  return {
    isYouTube: true,
    title: title,
    content: transcript || "Could not extract transcript automatically."
  };
}

// Listen for message from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getContent") {
    extractPageContent().then(data => {
      sendResponse(data);
    }).catch(error => {
      sendResponse({error: error.message});
    });
    return true; // Required for async response
  }
});