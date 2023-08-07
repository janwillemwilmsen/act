const express = require('express');
const { chromium } = require('playwright-chromium');
const Sitemapper = require('sitemapper');
const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');
const { createHtmlReport }  = require ('axe-html-reporter')
const fsp = fs.promises;
const url = require('url');
const path = require('path');
const { DateTime } = require("luxon");
const app = express();
const port = 3000;

const addDate = DateTime.now().toFormat('yyyy-MM-dd-HH');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function ensureDirectoryExists(directory) {
	if (!fs.existsSync(directory)) {
		fs.mkdirSync(directory, { recursive: true });
	}
}

ensureDirectoryExists('./public/a11y')

async function fetchXmlSitemap(xmlsitemap, outputDirName) {
	if (xmlsitemap.includes('essent.nl') || xmlsitemap.includes('energiedirect.nl')|| xmlsitemap.includes('claeren.nl')) {
		console.log('TRY in the if esse ene clare')
		try {
			const url = xmlsitemap;
			console.log(`Fetching sitemap from ${url}`);
			// Fetch the sitemap XML data
			const response = await fetch(url);
			if(!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			console.log('Received response from server');
			const xmlData = await response.text();
			// Parse the XML data
			console.log('Parsing XML data');
			const parser = new xml2js.Parser({
				explicitArray: false,
				tagNameProcessors: [xml2js.processors.stripPrefix]
			});
			const result = await parser.parseStringPromise(xmlData);
			if(!result || !result.urlset || !result.urlset.url) {
				throw new Error('Could not find expected data in XML');
			}
			// Extract the URLs
			console.log('Extracting URLs');
			const urls = Array.isArray(result.urlset.url)? result.urlset.url.map(u => u.loc):[result.urlset.url.loc];
			console.log('URLs ::', urls);
	
			let sites = [];
			for(const url of urls) {
				// sites.push({"site": url});
				sites.push(url);
			}
			// Convert the array of site URLs into JSON format
			const data = JSON.stringify(sites, null, 2);
			// Save the data to a JSON file in your 'screenshots' directory
			await fsp.writeFile(outputDirName + '/sitemap.json', data);

			return sites;
		} catch(error) {
			console.log('CATCH in ess ed clare')
			console.error(error);
			return []; // Return an empty list in case of an error
		}
	}

	else {
		console.log('Fetch Sitemap', xmlsitemap)
		const sitemapper = new Sitemapper({
			url: xmlsitemap,
			timeout: 15000, // timeout in milliseconds
		});
		
		try {
			const { sites } = await sitemapper.fetch();
			// Convert the array of site URLs into JSON format
			const data = JSON.stringify(sites, null, 2);
			// Save the data to a JSON file in your 'screenshots' directory
			await fsp.writeFile(outputDirName + '/sitemap.json', data);			
			// Return the sites array
			return sites;
		} catch (error) {
			console.log(error)
			// Return an empty array in case of error
			return [];
		}
	}
} // end Else

const slugify = str =>
str
.toLowerCase()
.trim()
.replace(/[^\w\s-]/g, '')
.replace(/[\s_-]+/g, '-')
.replace(/^-+|-+$/g, '')
.replace(/www/g, '')
.replace(/https/g, '')
.replace(/http/g, '')


// With concat you dont get the urls. so cant count errors per page.
// function filterAndJoinViolations(violations) {
//     return violations.reduce((acc, cur) => {
//         // Find if this violation id already exists in the accumulator
//         const existingViolation = acc.find(violation => violation.id === cur.id);
//         if (existingViolation) {
//             // If the violation id exists, join the nodes
//             existingViolation.nodes = existingViolation.nodes.concat(cur.nodes);
//         } else {
//             // If the violation id does not exist, add it to the accumulator
//             acc.push(cur);
//         }
//         return acc;
//     }, []);
// }




async function processUrls(urls, outputDirName) {
	// let a11yResults = [];
	let allResults = []; // initialize an empty array
	let numUrls = 0;
	let domainName = ''
	async function openAndWait(url) {
	  const browser = await chromium.launch({ headless: false, slowMo: 0 });
	  const page = await browser.newPage();
	  await page.goto(url);
	  numUrls++
	  let urlObj = new URL(url);
	  domainName = urlObj.hostname;


	  try {
		await page.addScriptTag({ path: 'axe.min.js' });
	  } catch {
		console.log('Error adding script');
	  }
  
	  try {
		var results = await page.evaluate(() => axe.run(document));
	  } catch {
		console.log('Error page evaluate script');
	  }
  
	  if (results.violations.length > 0) {
		console.log(`Found ${results.violations.length} accessibility violations`);
	  }
  
		//   a11yResults = a11yResults.concat(results.violations);
  
	  const slugifiedName = slugify(url);
	  const dateString = new Date().toISOString().split('T')[0];
	  const filename = `${outputDirName}/${slugifiedName}-${dateString}.json`;
	  fs.writeFileSync(filename, JSON.stringify(results));
  
	  const rawAxeResults = JSON.parse(fs.readFileSync(filename, 'utf8'));
	  createHtmlReport({
		// results: { violations: rawAxeResults.violations },
		results: rawAxeResults,
		options: {
		  projectKey: outputDirName,
		  outputDir: outputDirName,
		  reportFileName: `${slugifiedName}-axe-${dateString}.html`,
		},
	  });


	  ////
		//   a11yResults.push({ testurl: url, })


		if (results.violations.length > 0 || results.inapplicable.length > 0 || results.passes.length > 0) {
			let resultObj = {};
			resultObj.url = url; // save the url in the object
			let totalviolationsCount = 0;
			// map each category only if there are any results in it
			if (results.violations.length > 0) {
				resultObj.violations = results.violations.map((violation) => {
					totalviolationsCount += violation.nodes.length; // add the nodeCount of each violation to the totalCount
		
					return {
						id: violation.id,
						impact: violation.impact,
						description: violation.description,
						help: violation.help,
						nodeCount: violation.nodes.length,
						helpUrl: violation.helpUrl,
						tags: violation.tags
					};
				});
			}
			resultObj.totalviolationsCount = totalviolationsCount; // Assign totalCount to resultObj
		
			if (results.inapplicable.length > 0) {
				resultObj.inapplicable = results.inapplicable.map((inapplicable) => {
					return {
						id: inapplicable.id,
						impact: inapplicable.impact,
						description: inapplicable.description,
						help: inapplicable.help,
						nodeCount: inapplicable.nodes.length,
						helpUrl: inapplicable.helpUrl,
						tags: inapplicable.tags
					};
				});
			}
			if (results.incomplete.length > 0) {
				resultObj.incomplete = results.incomplete.map((incomplete) => {
					return {
						id: incomplete.id,
						impact: incomplete.impact,
						description: incomplete.description,
						help: incomplete.help,
						nodeCount: incomplete.nodes.length,
						helpUrl: incomplete.helpUrl,
						tags: incomplete.tags
					};
				});
			}
			if (results.passes.length > 0) {
				resultObj.passes = results.passes.map((pass) => {
					return {
						id: pass.id,
						impact: pass.impact,
						description: pass.description,
						help: pass.help,
						nodeCount: pass.nodes.length,
						helpUrl: pass.helpUrl,
						tags: pass.tags
					};
				});
			}
		
	
		// push the resultObj object into the allResults array
		allResults.push(resultObj);
	}

	  await page.waitForTimeout(3000);
	  await browser.close();
	} /// END openAndAwait function.
  
	for (let url of urls) {
	  await openAndWait(url);
	}

   
console.log('ALLLL', allResults);

function groupItems(allResults, key) {
	let groupedItems = {};
  
	for (let result of allResults) {
	  if (!result[key]) continue; // skip if no items for the current result
  
	  for (let item of result[key]) {
		if (!groupedItems[item.id]) {
		  // if this is the first time we see this item id, 
		  // just save the item with its URL in an array
		  groupedItems[item.id] = {
			id: item.id,
			impact: item.impact,
			description: item.description,
			help: item.help,
			urls: [result.url]
		  };

          // skip nodeCount for inapplicable items
          if (key !== 'inapplicable') {
            groupedItems[item.id].nodeCount = item.nodeCount;
          }
		} else {
		  // if we've already seen this item id, 
          // skip nodeCount for inapplicable items
          if (key !== 'inapplicable') {
		    // add the nodeCount and push the URL into the existing item
		    groupedItems[item.id].nodeCount += item.nodeCount;
          }
		  groupedItems[item.id].urls.push(result.url);
		}
	  }
	}
  
	return groupedItems;
  }

  
  let groupedViolations = groupItems(allResults, 'violations');
  let groupedPassedItems = groupItems(allResults, 'passes');
  let groupedIncompleteItems = groupItems(allResults, 'incomplete');
  let groupedinapplicableItems = groupItems(allResults, 'inapplicable');




  /// Count total nodeCounts per category:
  let totalViolationsCount = 0;
for (let key in groupedViolations) {
  totalViolationsCount += groupedViolations[key].nodeCount;
}

let totalPassedItemsCount = 0;
for (let key in groupedPassedItems) {
  totalPassedItemsCount += groupedPassedItems[key].nodeCount;
}

let totalInapplicableItemsCount = 0;
for (let key in groupedinapplicableItems) {
  totalInapplicableItemsCount += groupedinapplicableItems[key].nodeCount;
}

let totalIncompleteItemsCount = 0;
for (let key in groupedIncompleteItems) {
	totalIncompleteItemsCount += groupedIncompleteItems[key].nodeCount;
}

console.log("TotalUrls:", numUrls);
console.log("TotalViolationsCount:", totalViolationsCount);
console.log("TotalPassedItemsCount:", totalPassedItemsCount);
console.log("TotalIncompleteCount:", totalIncompleteItemsCount);
console.log("TotalInapplicableItemsCount:", totalInapplicableItemsCount); /// returns 0. no nodeCount possible.

const totalElementsCount = totalViolationsCount + totalPassedItemsCount + totalIncompleteItemsCount
const averageElementsPerPage = totalElementsCount / numUrls
const averageErrorPerPage = totalViolationsCount / numUrls
const errorPercentage = ( totalViolationsCount / totalElementsCount ) * 100

  console.log('totalElementsCount',totalElementsCount);
  console.log('averageElementsPerPage',averageElementsPerPage);
  console.log('averageErrorPerPage',averageErrorPerPage);
  console.log('errorPercentage',errorPercentage);

    const metaData = {
		"outputFolder": outputDirName,
		"domainname": domainName,
		"timeStamp": DateTime.now().toFormat('yyyy-MM-dd-HH'),
		"totalUrls": numUrls,
		"totalViolationsCount": totalViolationsCount,
		"totalPassedItemsCount": totalPassedItemsCount,
		"totalIncompleteCount": totalIncompleteItemsCount,
		"totalElementsCount": totalElementsCount,
		"averageElementsPerPage": averageElementsPerPage,
		"averageErrorPerPage": averageErrorPerPage,
		"errorPercentage": errorPercentage,
	}
	// call filterAndJoinViolations after you have processed all urls
	// a11yResults = filterAndJoinViolations(a11yResults);
  
	fs.writeFileSync(`${outputDirName}/joined.json`, JSON.stringify({"meta": metaData,"singleresults": allResults, "groupedViolations":groupedViolations, "groupedPassedItems": groupedPassedItems, "groupedInapplicable":groupedinapplicableItems}));
	
	

/// write/append metadata block level higher..
	async function appendData(newData) {
		// The path to your JSON file
		const filePath = outputDirName + '/../yourDataFile.json';
		// Read the existing data from the JSON file
		let existingData;
		try {
		  existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		} catch (err) {
		  if (err.code === 'ENOENT') {  // File doesn't exist yet
			fs.writeFileSync(filePath, JSON.stringify([{"meta": newData}]))  // Write an array
			existingData = [];  // This will be an empty array since you've just written the newData to the file
		  } else {
			throw err;
		  }
		}
		// Append the new data
		existingData.push({"meta": newData});  // Always push an object containing the meta data
		// Write the updated data back to the file
		fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
	  }
	  
	  appendData(metaData);
	  


	// createHtmlReport({
	//   results: { violations: a11yResults },
	//   options: {
	// 	projectKey: outputDirName,
	// 	outputDir: outputDirName,
	// 	reportFileName: 'index.html',
	//   },
	// });
  }
  
  

app.get('/process-sitemap', async (req, res) => {
    const sitemapUrl = req.query.sitemapUrl;

    if (!sitemapUrl) {
        return res.status(400).send('Missing sitemapUrl parameter');
    }

    try {
        // Get XML data from sitemap URL
        const response = await axios.get(sitemapUrl);
		// console.log('Response /proces sitemap:',response)
       

        // // Get domain from sitemap URL
        let domain = new url.URL(sitemapUrl).hostname;
        domain = domain.replace(/^www\./, '').replace(/\./g, '-');
		

		const outputDirName = `./public/a11y/${domain}/${addDate}`

        // // Create directory named after the domain if it doesn't exist
        const dirPath = path.join(__dirname, `${outputDirName}`);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

     

		const urllist =	await fetchXmlSitemap(sitemapUrl, outputDirName);
		// const firstUrl = urllist[0];
		const limitedUrllist = urllist.slice(0, 3); 

		console.log('first:', limitedUrllist)

		await processUrls(limitedUrllist, outputDirName);


        return res.status(200).send('Sitemap processed successfully.');

    } catch (error) {
        console.error(error);
        return res.status(500).send('An error occurred while processing the sitemap.');
    }
});






/// for testing
app.get('/screenshot', async (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).send('Missing URL parameter');
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);

  const screenshotBuffer = await page.screenshot();
  await browser.close();

  const screenshotPath = path.join(__dirname, 'screenshot.png');
  fs.writeFileSync(screenshotPath, screenshotBuffer);

  return res.sendFile(screenshotPath);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
