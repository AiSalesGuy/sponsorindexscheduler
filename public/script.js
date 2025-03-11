// Initialize calendar
const calendar = flatpickr("#calendar", {
    inline: true,
    dateFormat: "Y-m-d",
    minDate: "today",
    disable: [
        function(date) {
            // Disable weekends
            return (date.getDay() === 0 || date.getDay() === 6);
        }
    ]
});

// Store form data
let formData = {
    date: "",
    time: "",
    time12Hour: "",
    name: "",
    email: "",
    budget: "",
    campaignGoals: "",
    urlSlug: ""
};

// Generate URL slug from the referrer URL
function generateUrlSlug() {
    // Try to get the referrer URL first
    const referrer = document.referrer;
    console.log('Referrer URL:', referrer);
    
    if (referrer && referrer.includes('sponsorindex.com')) {
        try {
            const referrerUrl = new URL(referrer);
            const pathSegments = referrerUrl.pathname.split('/').filter(segment => segment);
            
            // Check if this is a newsletter page
            if (pathSegments.length >= 2 && pathSegments[0] === 'top-newsletters') {
                console.log('Found newsletter slug:', pathSegments[1]);
                return pathSegments[1];
            }
        } catch (error) {
            console.error('Error parsing referrer URL:', error);
        }
    }
    
    // If no valid referrer, check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const newsletterSlug = urlParams.get('newsletter');
    if (newsletterSlug) {
        console.log('Found newsletter slug from URL params:', newsletterSlug);
        return newsletterSlug;
    }
    
    console.warn('No valid newsletter slug found, using fallback');
    return 'newsletter-' + Date.now();
}

// Set initial URL slug
formData.urlSlug = generateUrlSlug();

// Log the URL slug for debugging
console.log('Generated URL slug:', formData.urlSlug);

// Generate time slots
function generateTimeSlots() {
    const timeGrid = document.getElementById('timeGrid');
    const startHour = 9; // 9 AM
    const endHour = 17; // 5 PM
    
    for (let hour = startHour; hour < endHour; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            const hour12 = hour > 12 ? hour - 12 : hour;
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const timeString = `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
            const hour24 = hour.toString().padStart(2, '0');
            const minute24 = minute.toString().padStart(2, '0');
            
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'time-button';
            button.textContent = timeString;
            button.dataset.time = `${hour24}:${minute24}`;
            button.dataset.time12 = timeString;
            
            button.addEventListener('click', selectTime);
            timeGrid.appendChild(button);
        }
    }
}

// Handle time selection
function selectTime(e) {
    // Remove selection from all buttons
    document.querySelectorAll('.time-button').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Add selection to clicked button
    e.target.classList.add('selected');
    
    // Store the selected time
    formData.time = e.target.dataset.time;
    formData.time12Hour = e.target.dataset.time12;
}

// Generate time slots when page loads
generateTimeSlots();

// Navigation functions
function nextPage(currentPage) {
    // Validate current page
    if (!validatePage(currentPage)) {
        return;
    }

    // Hide current page
    document.getElementById(`page${currentPage}`).style.display = 'none';
    
    // Show next page
    document.getElementById(`page${currentPage + 1}`).style.display = 'block';
    
    // Update progress bar
    updateProgress(currentPage + 1);
}

function previousPage(currentPage) {
    // Hide current page
    document.getElementById(`page${currentPage}`).style.display = 'none';
    
    // Show previous page
    document.getElementById(`page${currentPage - 1}`).style.display = 'block';
    
    // Update progress bar
    updateProgress(currentPage - 1);
}

function updateProgress(currentPage) {
    // Reset all steps
    document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
    
    // Set active step
    for (let i = 1; i <= currentPage; i++) {
        document.querySelector(`.progress-bar .step:nth-child(${i})`).classList.add('active');
    }
}

function validatePage(pageNumber) {
    switch(pageNumber) {
        case 1:
            if (!calendar.selectedDates[0]) {
                alert("Please select a date");
                return false;
            }
            formData.date = calendar.selectedDates[0].toISOString().split('T')[0];
            return true;
        
        case 2:
            if (!formData.time) {
                alert("Please select a time");
                return false;
            }
            return true;
        
        default:
            return true;
    }
}

// Form submission
document.getElementById('contactForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Gather form data
    formData.name = document.getElementById('name').value;
    formData.email = document.getElementById('email').value;
    formData.budget = document.getElementById('budget').value;
    formData.campaignGoals = document.getElementById('campaignGoals').value;
    
    console.log('Submitting form data:', formData);
    
    try {
        console.log('Sending request to:', 'https://sponsorindexscheduler-2.onrender.com/api/schedule');
        const response = await fetch('https://sponsorindexscheduler-2.onrender.com/api/schedule', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);

        const responseText = await response.text();
        console.log('Raw response:', responseText);

        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Error parsing response:', parseError);
            throw new Error('Invalid response from server: ' + responseText);
        }

        if (!response.ok) {
            throw new Error(result.error || `HTTP error! status: ${response.status}`);
        }

        if (result.success) {
            console.log('Appointment scheduled successfully:', result);
            alert('Appointment scheduled successfully! We will contact you soon.');
            // Reset form and go back to first page
            document.getElementById('contactForm').reset();
            document.querySelectorAll('.page').forEach(page => page.style.display = 'none');
            document.getElementById('page1').style.display = 'block';
            updateProgress(1);
        } else {
            throw new Error(result.error || 'Failed to schedule appointment');
        }
    } catch (error) {
        console.error('Error details:', error);
        alert('There was an error scheduling your appointment: ' + error.message);
    }
}); 