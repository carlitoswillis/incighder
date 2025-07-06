from selenium import webdriver
from selenium.webdriver.common.by import By
import time
import urllib.parse
import json
import os

# Initialize WebDriver
driver = webdriver.Chrome()

# Navigate to the user's SoundCloud tracks page
driver.get('https://soundcloud.com/1brezzo/tracks')

# Scroll to the bottom of the page to load all tracks
last_height = driver.execute_script("return document.body.scrollHeight")
while True:
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(2)  # Adjust delay as needed depending on your connection
    new_height = driver.execute_script("return document.body.scrollHeight")
    if new_height == last_height:
        break
    last_height = new_height

# Initialize variables for track data
total_plays = 0
top_song = None
top_song_plays = 0
top_song_link = None

# Find all tracks and loop through them
tracks = driver.find_elements(By.CLASS_NAME, "soundList__item")
for track in tracks:
    try:
        # Get the play count for each track
        play_count_element = track.find_element(By.CLASS_NAME, "sc-ministats-item")
        play_count_text = play_count_element.text.split()[0].replace(',', '')  # Remove commas and split to take the first part before any newline or extra text
        
        if 'K' in play_count_text:
            play_count = float(play_count_text.replace('K', '')) * 1000
        elif 'M' in play_count_text:
            play_count = float(play_count_text.replace('M', '')) * 1_000_000
        else:
            play_count = int(play_count_text)

        # Accumulate total plays
        total_plays += play_count

        # Get the track link and compare for top song
        track_link_element = track.find_element(By.CSS_SELECTOR, "a.soundTitle__title")
        track_link = track_link_element.get_attribute('href')
        track_name = track_link_element.text
        
        # Check if current track has more plays than the top song
        if play_count > top_song_plays:
            top_song = track_name
            top_song_plays = play_count
            top_song_link = track_link

    except Exception as e:
        print(f"Error fetching track data: {e}")

# Function to decode URL from SoundCloud's redirected links
def decode_url(url):
    parsed_url = urllib.parse.urlparse(url)
    query_params = urllib.parse.parse_qs(parsed_url.query)
    if 'url' in query_params:
        decoded_url = urllib.parse.unquote(query_params['url'][0])
        return decoded_url
    return url

# Function to grab followers and social links from the bio/stats section
def grab_followers_and_links():
    data = {}
    try:
        # Grab followers
        followers = driver.find_element(By.CSS_SELECTOR, ".infoStats__statLink[title*='followers'] .infoStats__value").text
        print(f"Followers: {followers}")
        data['followers'] = followers

        # Grab social links by domain
        links = driver.find_elements(By.CSS_SELECTOR, ".web-profiles a")
        for link in links:
            url = link.get_attribute('href')
            decoded_url = decode_url(url)
            domain = urllib.parse.urlparse(decoded_url).netloc.split('.')[1]  # Extract domain (e.g., Instagram)
            data[domain.capitalize()] = decoded_url  # Update link in the dictionary

    except Exception as e:
        print(f"Error fetching stats and links: {e}")

    return data

# Function to update JSON with new links and save results, preserving existing ones
def update_json_with_links_and_stats(artist_name, new_data, total_plays, top_song, top_song_link, top_song_plays):
    # Path to the artist's JSON file
    json_file = f'{artist_name}.json'
    
    # Load existing JSON data if it exists
    if os.path.exists(json_file):
        with open(json_file, 'r') as file:
            existing_data = json.load(file)
    else:
        existing_data = {
            'Instagram': 'N/A',
            'Twitter': 'N/A',
            'TikTok': 'N/A',
            'Spotify': 'N/A',
            'SoundCloud': 'N/A',
            'YouTube': 'N/A',
            'followers': None,
            'soundcloud_total_plays': 0,
            'soundcloud_top_song': None,
            'soundcloud_top_song_link': None,
            'soundcloud_top_song_plays': 0
        }

    # Update the existing data with new values from the bio/stats section, without overwriting valid existing data
    for key, value in new_data.items():
        if value and (existing_data.get(key) == 'N/A' or existing_data.get(key) is None):  # Only overwrite if the current value is 'N/A' or None
            existing_data[key] = value

    # Update other stats like total plays, top song, etc.
    if total_plays:
        existing_data['soundcloud_total_plays'] = total_plays

    if top_song:
        existing_data['soundcloud_top_song'] = top_song

    if top_song_link:
        existing_data['soundcloud_top_song_link'] = top_song_link

    if top_song_plays:
        existing_data['soundcloud_top_song_plays'] = top_song_plays

    # Save updated data back to the JSON file
    with open(json_file, 'w') as outfile:
        json.dump(existing_data, outfile, indent=4)

# Run the functions
artist_name = 'brezzo'
social_data = grab_followers_and_links()
update_json_with_links_and_stats(
    artist_name=artist_name,
    new_data=social_data,
    total_plays=total_plays,
    top_song=top_song,
    top_song_link=top_song_link,
    top_song_plays=top_song_plays
)

# Close the browser when done
driver.quit()