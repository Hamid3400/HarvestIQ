document.addEventListener("DOMContentLoaded", () => {
    // 1. HANDLE INITIAL PAGE LOAD
    const loaderElement = document.querySelector('.loader');
    const minDisplayTime = 1200; // Time in ms to show spinning logo on entry
    const startTime = Date.now();

    window.addEventListener("load", () => {
        if (loaderElement) {
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

            setTimeout(() => {
                loaderElement.classList.add('fade-out');
                setTimeout(() => loaderElement.remove(), 500);
            }, remainingTime);
        }
    });

    // 2. HANDLE CLICKS TO OTHER PAGES (OUTGOING LINKS)
    document.addEventListener("click", (e) => {
        const link = e.target.closest('a');
        
        // Check if it's a valid internal link (not an external link, anchor, or download)
        if (
            link && 
            link.href && 
            link.href.startsWith(window.location.origin) && 
            !link.getAttribute('target') && 
            !link.getAttribute('download') &&
            link.getAttribute('href') !== '#'
        ) {
            e.preventDefault(); // Stop instant navigation
            const targetUrl = link.href;

            // Create or show the loader if it was removed
            let activeLoader = document.querySelector('.loader');
            if (!activeLoader) {
                activeLoader = document.createElement('div');
                activeLoader.className = 'loader';
                activeLoader.innerHTML = `
                    <div class="loader-container">
                        <div class="loader-image">
                            <img src="/assets/images/harvestIQ Logo.png" alt="HarvestIQ Logo">
                        </div>
                        <div class="loader-text">
                            <h2>HarvestIQ</h2>
                            <p>Ai-powered farming, simplified</p>
                        </div>
                    </div>
                `;
                document.body.appendChild(activeLoader);
            }

            // Fade in the loader immediately
            activeLoader.classList.remove('fade-out');
            activeLoader.style.display = 'flex';

            // Wait a brief moment for the spinning animation to show, then go to the new page
            setTimeout(() => {
                window.location.href = targetUrl;
            }, 600);
        }
    });
});