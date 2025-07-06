from selenium import webdriver
from selenium.webdriver.common.by import By
import time

# Initialize WebDriver
driver = webdriver.Chrome()

# Function to grab Instagram followers by searching for the meta description tag
def grab_instagram_followers(instagram_url):
    driver.get(instagram_url)
    time.sleep(2)  # Wait for the page to load

    try:
        # Grab the meta description tag containing follower information
        meta_tag = driver.find_element(By.XPATH, "//meta[@name='description']")
        description = meta_tag.get_attribute("content")
        
        # Extract the followers count from the meta tag content
        followers_info = description.split(" Followers")[0]
        followers_count = followers_info.split(", ")[0]
        print(f"Instagram followers: {followers_count}")
        return followers_count
    except Exception as e:
        print(f"Error fetching Instagram followers: {e}")
        return None

    finally:
        driver.quit()

# Example usage
grab_instagram_followers('https://www.instagram.com/1brezzo/')

def grab_twitter_followers(twitter_url):
    driver.get(twitter_url)
    time.sleep(3)  # Wait for the page to load

    try:
        # Locate the element that contains the follower count using the appropriate CSS selectors or XPATH
        followers_element = driver.find_element(By.XPATH, "//a[contains(@href, '/followers') or contains(@href, '/verified_followers')]//span[contains(text(), 'Followers')]//preceding-sibling::span")
        followers_count = followers_element.text
        print(f"Twitter Followers: {followers_count}")
        return followers_count
    except Exception as e:
        print(f"Error fetching Twitter followers: {e}")
        return None
    finally:
        driver.quit()

# Example usage
grab_twitter_followers('https://twitter.com/1brezzo_')