document.getElementById('urlForm').addEventListener('submit', function(event) {
	// Prevent the form from being submitted normally
	event.preventDefault();

	// Get the sitemapUrl value from the form
	const sitemapUrl = document.getElementById('sitemapUrl').value;
	console.log('sitemap url', sitemapUrl)

})

