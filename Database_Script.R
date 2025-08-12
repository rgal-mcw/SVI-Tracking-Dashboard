# SVI Databasing Script
# Ryan Gallagher (June 2025)

# This script will format a database from our svi samples

library(dplyr)
library(purrr)
library(stringr)
library(readxl)
library(tidyxl)
library(lubridate)
library(timeDate)

path1 = "/data/svi-prom/flowcell_10.4.1/"
path2 = "/oldmaple/data/svi/prom/mcw_svi/flowcell_9.4.1/"

all_subdirs = list()

# --- Run rclone for OneDrive ---

# Define your rclone command as a string.
rclone_command = "rclone ls OneDrive:'SVI Powerpoints' --include '*.pptx'"
# Execute the system command and capture its exit status
rclone_pptx = system(rclone_command, intern=T)

pptx_ids = rclone_pptx %>%
  str_extract_all("(?<=SVI[-_])\\d{4}") %>% # Use lookbehind to find digits after "SVI-"
  unlist() %>%                          # Convert the list to a simple vector
  unique()                              # Keep only the unique IDs

#rclone_pptx = as.data.frame(system(rclone_command, intern=T)) %>% rename(pptx=1)

# --- Read which samples uploaded to Geneyx ---
geneyx = readLines("/data/svi-prom/geneyx_upload/analyzed.txt")

# --- Read Accessioning for which samples are incoming ---

remote_folder = "OneDrive:Genomic Peds Clinical Labs - Accessioning Study 3335/"
file_to_copy = "3335 Accessioning.xlsx"
temp_xlsx = tempfile(fileext = ".xlsx")

rclone_command = sprintf(
  "rclone copy --include %s %s %s",
  shQuote(file_to_copy),      # =- The file to include
  shQuote(remote_folder),     # =- The folder to look inside
  shQuote(dirname(temp_xlsx)) # =- The destination directory for the temp file
)

# Read the file within a tryCatch block to ensure cleanup
accession = tryCatch({
  
  # Execute the rclone command
  exit_code = system(rclone_command)
  if (exit_code != 0) {
    stop("rclone command failed. Check rclone configuration and permissions.")
  }
  
  # The temp file will be in the temp directory with its original name.
  # We need to construct the full path to it.
  local_file_path = file.path(dirname(temp_xlsx), file_to_copy)
  
  # Read the local temporary file
  message("Successfully copied file. Reading into R...")
  
  full_accession = readxl::read_xlsx(local_file_path, sheet=1)
  cells = tidyxl::xlsx_cells(local_file_path, sheet = 1) %>% filter(str_detect(character, regex("^MCW_SVI_", ignore_case = TRUE)))
  formats = tidyxl::xlsx_formats(local_file_path)
  
  # Combine cell data with formatting to get colors
  accession_with_colors = cells %>%
    mutate(
      fill_color = formats$local$fill$patternFill$fgColor$rgb[local_format_id]
    ) %>%
    select(character, fill_color) %>% rename("Sample ID" = character)
  
  # Merge full with color to get proband information
  left_join(full_accession, accession_with_colors, by = "Sample ID") %>%
    mutate(
      proband = case_when(
        # If fill_color is blue, proband is 1
        fill_color == "FF00B0F0" ~ 1,
        
        # If fill_color is orange, proband is 0
        fill_color == "FFFF9900" ~ 0,
        
        # For all other cases, proband is NA
        TRUE ~ NA_real_
      )
    )
  
}, finally = {
  
  # Clean up by deleting the temporary file if it exists
  local_file_path = file.path(dirname(temp_xlsx), file_to_copy)
  if (file.exists(local_file_path)) {
    file.remove(local_file_path)
    message("Temporary file has been removed.")
  }
})

accession = accession %>% select("Sample ID", "proband", "Date Received", "MRN", 
                                 "Submitter ID/ Acc. No.", "AGen ID", "Comments") %>% 
                          mutate(ID = str_extract(`Sample ID`, "\\d{4}"))


# --- Get subdirectories from the first path ---
if (dir.exists(path1)) {
  subdirs1_full = list.dirs(path1, recursive = FALSE, full.names = TRUE)
  if (length(subdirs1_full) > 0) {
    subdirs1_names = basename(subdirs1_full)
    # Create a data frame for these subdirectories with their source
    df1 = data.frame(
      Sample = subdirs1_names,
      SamplePath = rep(path1, length(subdirs1_names)),
      stringsAsFactors = FALSE
    )
    all_subdirs[[length(all_subdirs) + 1]] = df1
  } else {
    message(paste("No subdirectories found in:", path1))
  }
} else {
  warning(paste("Directory does not exist:", path1))
}

# --- Get subdirectories from the second path ---
if (dir.exists(path2)) {
  subdirs2_full = list.dirs(path2, recursive = FALSE, full.names = TRUE)
  if (length(subdirs2_full) > 0) {
    subdirs2_names = basename(subdirs2_full)
    df2 = data.frame(
      Sample = subdirs2_names,
      SamplePath = rep(path2, length(subdirs2_names)),
      stringsAsFactors = FALSE
    )
    all_subdirs[[length(all_subdirs) + 1]] = df2
  } else {
    message(paste("No subdirectories found in:", path2))
  }
} else {
  warning(paste("Directory does not exist:", path2))
}

# --- Combine the data frames ---
if (length(all_subdirs) > 0) {
  final_df = do.call(rbind, all_subdirs)
  
  rownames(final_df) = NULL
  
} else {
  message("\nNo subdirectories found in any of the specified paths. Empty data frame.")
  # Create an empty data frame with the desired columns if no subdirectories are found
  final_df = data.frame(
    Sample = character(0),
    SamplePath = character(0),
    stringsAsFactors = FALSE
  )
}

final_df = final_df %>%
  # Add Identifier column
  mutate(ID = str_extract(Sample, "\\d{4}"))

svi.database = full_join(final_df, accession, by = "ID") %>% arrange(desc(`Date Received`))

svi.database = svi.database %>% mutate(
    Identifier = case_when(
      grepl("_UIC$", `Sample ID`) ~ "UIC",
      grepl("_UDD$", `Sample ID`) ~ "UDD",
      TRUE ~ "Base"
    ),
    DataDate = pmap_chr(list(SamplePath, Sample), ~{
      sample_dir_path = file.path(.x, .y)
      search_pattern = file.path(sample_dir_path, "*.sorted.bam")
      bam_files = Sys.glob(search_pattern)
      
      if (length(bam_files) > 0) {
        latest_file = bam_files[which.max(file.info(bam_files)$mtime)]
        format(file.info(latest_file)$mtime, "%Y-%m-%d")
      } else {
        NA_character_
      }
    }),
    report = as.integer(ID %in% pptx_ids),
    geneyx_uploaded = as.integer(ID %in% geneyx),
  ) %>% select(
    -Sample,
    -ID,
    
  )

write.csv(svi.database, file="./svi-dashboard/public/svi_database.csv", row.names=T)
message("Successfully wrote svi_database.csv")


# --- Write Sample Scheduler ---

scheduler = svi.database %>% select(`Sample ID`, proband, `Date Received`, Identifier, report) %>% filter(proband == 1, report == 0)
hotlist = read.csv("./svi-dashboard/public/hotlist.csv", stringsAsFactors = FALSE)

prioritized_list = scheduler %>%
  mutate(
    `Date Received` = as.Date(`Date Received`),
    year_received = year(`Date Received`),
    sample_id_num = as.numeric(str_extract(`Sample ID`, "\\d+"))
  ) %>%
  mutate(
    priority_level = case_when(
      # --- Check if the sample is in the hot list first ---
      `Sample ID` %in% hotlist$`Sample.ID`           ~ 0, # Priority 0 for critical samples
      
      Identifier == "UIC"                         ~ 1,
      Identifier == "UDD" & year_received == 2025 ~ 2,
      Identifier == "UDD" & year_received == 2024 ~ 3,
      Identifier == "UDD" & year_received == 2023 ~ 4,
      Identifier == "UDD" & year_received == 2022 ~ 5,
      Identifier == "Base" & year_received == 2025 ~ 102,
      Identifier == "Base" & year_received == 2024 ~ 103,
      Identifier == "Base" & year_received == 2023 ~ 104,
      Identifier == "Base" & year_received == 2022 ~ 105,
      TRUE                                        ~ 999
    )
  ) %>%
  arrange(priority_level, `Date Received`, sample_id_num) %>%
  mutate(
    priority_rank = row_number(),
    reason_for_priority = case_when(
      priority_level == 0 ~ "CRITICAL: Hot List",
      Identifier == "UIC" ~ "Highest Priority: UIC",
      TRUE ~ paste(Identifier, year_received)
    )
  )

# Step 4: Generate and assign meeting dates, reading from the canceled meetings list
# --- Read the list of canceled meeting dates ---
canceled_dates_df = read.csv("./svi-dashboard/public/canceled_meetings.csv", stringsAsFactors = FALSE)
canceled_dates = as.Date(canceled_dates_df$Date)

# Get the total number of meetings needed
num_meetings = nrow(prioritized_list)

# --- NEW: Generate a list of dates to skip ---
# 1. Generate US Federal Holidays for the next couple of years
#    We use holidayNYSE() as a good list of US public holidays.
holidays_2025 = as.Date(holidayNYSE(2025))
holidays_2026 = as.Date(holidayNYSE(2026)) # Look ahead to avoid scheduling into next year's holidays
us_holidays = c(holidays_2025, holidays_2026)

# 2. Read the user-provided canceled dates
canceled_dates_df = read.csv("./svi-dashboard/public/canceled_meetings.csv", stringsAsFactors = FALSE)
user_canceled_dates = as.Date(canceled_dates_df$Date)

# 3. Create a single, combined list of all dates to skip
do_not_schedule_dates = c(user_canceled_dates, us_holidays)


# --- The rest of the date generation logic uses this new combined list ---
# Get the total number of meetings needed
num_meetings = nrow(prioritized_list)

# Find the next upcoming Tuesday or Friday
today = Sys.Date() - 1
#today = as.Date("2025-06-18")
days_to_tuesday = (3 - wday(today) + 7) %% 7; if (days_to_tuesday == 0) days_to_tuesday = 7
days_to_friday = (6 - wday(today) + 7) %% 7; if (days_to_friday == 0) days_to_friday = 7
first_meeting = min(today + days(days_to_tuesday), today + days(days_to_friday))

# Generate a sequence of potential Tuesdays and Fridays
potential_dates = list()
current_date = first_meeting
# Generate more dates than needed to account for cancellations and holidays
for (i in 1:(num_meetings + 40)) { # Increased buffer for holidays
  potential_dates[[i]] = current_date
  current_date = if (wday(current_date) == 3) current_date + days(3) else current_date + days(4)
}
potential_dates = do.call("c", potential_dates)

# --- UPDATED: Filter using the combined "do not schedule" list ---
final_meeting_dates = potential_dates[!potential_dates %in% do_not_schedule_dates]

# Assign the filtered, corrected dates to our list
final_schedule = prioritized_list %>%
  mutate(meeting_date = final_meeting_dates[1:num_meetings])

write.csv(final_schedule, file="./svi-dashboard/public/analysis_scheduler.csv", row.names=F, quote=F)
message("Successfully wrote analysis_scheduler.csv")

system("cp /home/rgallagher/SVI-Tracking/svi-dashboard/public/svi_database.csv /home/rgallagher/SVI-Tracking/svi-dashboard/dist/")
system("cp /home/rgallagher/SVI-Tracking/svi-dashboard/public/analysis_scheduler.csv /home/rgallagher/SVI-Tracking/svi-dashboard/dist/")

message("Copied data to dist.")
